const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const mongoose = require('mongoose');
const NewsEvent = require('../models/NewsEvent');

puppeteer.use(StealthPlugin());

const scrapeForexFactory = async () => {
  console.log('🕷️ 启动 V5.8 反拦截突破版 (伪造UA + 智能等待 + 隐藏自动化特征)...');

  // 1. 数据库连接
  if (mongoose.connection.readyState === 0) {
      console.log('⚠️ 建立临时数据库连接...');
      await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/forex_data');
  }

  let browser;
  try {
    // 🔥 1. 启动配置升级：隐藏自动化特征
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled', // 关键：禁用自动化控制特征
        '--window-size=1920,1080' // 伪装成正常屏幕大小
      ]
    });

    const weeks = ['this', 'next'];

    for (const week of weeks) {
      console.log(`\n=============================`);
      console.log(`📅 正在扫描: week=${week}`);
      
      const page = await browser.newPage();
      
      try {
          // 🔥 2. 伪造 User-Agent (这是最关键的一步！)
          // 使用最新的 Chrome Windows User Agent，让服务器以为是真人在访问
          await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

          // 开启日志
          page.on('console', msg => {
              if (msg.text().startsWith('DEBUG:')) console.log(msg.text());
          });

          // 注入 Cookie
          const filterConfig = encodeURIComponent(JSON.stringify({
            impacts: ["3"], 
            events: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"]
          }));
          
          await page.setCookie({
            name: 'ff_calendar_filters', 
            value: filterConfig, 
            domain: '.forexfactory.com', 
            path: '/', 
            expires: Math.floor(Date.now() / 1000) + 31536000
          });

          // 跳转页面
          console.log('🚀 正在跳转...');
          await page.goto(`https://www.forexfactory.com/calendar?week=${week}`, {
            waitUntil: 'domcontentloaded', // 改为 domcontentloaded，后续用 selector 等待
            timeout: 60000
          });

          // 🔥 3. 智能等待：不仅仅等时间，而是等表格出现
          // 这一步会尝试突破 "Just a moment" 页面，直到真正的表格加载出来
          try {
            console.log('⏳ 等待新闻表格加载 (尝试突破 Cloudflare)...');
            await page.waitForSelector('table.calendar__table', { timeout: 15000 });
            console.log('✅ 成功突破拦截，表格已加载！');
          } catch (e) {
            console.log('⚠️ 等待超时，可能是 Cloudflare 还在验证，尝试继续滚动...');
          }

          console.log('🖱️ 正在自动滚动页面...');
          await page.evaluate(async () => {
              await new Promise((resolve) => {
                  let totalHeight = 0;
                  const distance = 100;
                  const timer = setInterval(() => {
                      const scrollHeight = document.body.scrollHeight;
                      window.scrollBy(0, distance);
                      totalHeight += distance;
                      if(totalHeight >= scrollHeight - window.innerHeight){
                          clearInterval(timer);
                          resolve();
                      }
                  }, 50); 
              });
          });
          
          await new Promise(r => setTimeout(r, 2000)); // 多等2秒让数据渲染

          // 抓取逻辑
          const rawEvents = await page.evaluate(() => {
            const data = [];
            const rows = document.querySelectorAll('tr.calendar__row'); 
            
            let memDate = ""; 
            let memTime = ""; 
            
            console.log(`DEBUG: [Week: ${document.title}] 页面总行数: ${rows.length}`); 

            rows.forEach((row) => {
              const getText = (s) => { const el = row.querySelector(s); return el ? el.textContent.trim() : ""; };
              
              let rawDate = getText('.calendar__date');
              let rawTime = getText('.calendar__time');
              let rawCurrency = getText('.calendar__currency'); 
              const title = getText('.calendar__event-title');

              if (rawDate && rawDate.length > 1) memDate = rawDate;
              if (rawTime && rawTime.length > 1) memTime = rawTime;

              if (!title) return; 

              const impactEl = row.querySelector('.calendar__impact .icon');
              const isRed = impactEl && (impactEl.className.includes('impact-red') || impactEl.className.includes('high') || impactEl.className.includes('impact-3'));

              const isTargetCurrency = (rawCurrency === 'USD' || rawCurrency === 'All');
              const isStacked = (rawCurrency === '');

              if (isRed) {
                  if (isTargetCurrency || isStacked) {
                      data.push({
                          title, 
                          currency: rawCurrency || 'USD', 
                          impact: 'High', 
                          rawDate: memDate, 
                          rawTime: memTime,
                          forecast: getText('.calendar__forecast'), 
                          actual: getText('.calendar__actual'), 
                          previous: getText('.calendar__previous')
                      });
                  }
              } 
            });
            return data;
          });

          console.log(`📊 [${week}] 抓取到: ${rawEvents.length} 条有效数据`);

          let savedCount = 0;
          for (const event of rawEvents) {
            if (!event.rawTime) continue; 

            const currentYear = new Date().getFullYear();
            const currentMonth = new Date().getMonth();
            let year = currentYear;
            
            if (event.rawDate.includes('Dec') && currentMonth === 0) year = currentYear - 1;
            else if (event.rawDate.includes('Jan') && currentMonth === 11) year = currentYear + 1;

            let timeStr = "";
            
            if (event.rawTime.toLowerCase().includes('day')) {
                 timeStr = "12:00 am";
                 console.log(`ℹ️ [${week}] 全天事件: ${event.title}`);
            } else {
                 timeStr = event.rawTime.replace(/(\d)(am|pm)/i, '$1 $2');
            }
            
            let dateStr = `${event.rawDate} ${year} ${timeStr} -0800`;
            const dateObj = new Date(dateStr);

            if (!isNaN(dateObj.getTime())) {
               await NewsEvent.findOneAndUpdate(
                { title: event.title, date: dateObj },
                { ...event, date: dateObj },
                { upsert: true, new: true, setDefaultsOnInsert: true }
              );
              savedCount++;
            }
          }
          console.log(`💾 [${week}] 入库成功: ${savedCount}`);

      } catch (err) {
          console.error(`❌ [${week}] 扫描出错:`, err);
      } finally {
          await page.close(); 
      }
    }

  } catch (error) {
    console.error('❌ 全局错误:', error);
  } finally {
    if (browser) await browser.close();
    console.log('👋 任务结束');
  }
};

module.exports = scrapeForexFactory;