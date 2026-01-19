const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const mongoose = require('mongoose');
const NewsEvent = require('../models/NewsEvent');

puppeteer.use(StealthPlugin());

const scrapeForexFactory = async () => {
  console.log('🕷️ 启动 V5.6 最终修正版 (修复 Day 事件漏抓 + 独立页面抓取)...');

  // 1. 数据库连接
  if (mongoose.connection.readyState === 0) {
      console.log('⚠️ 建立临时数据库连接...');
      await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/forex_data');
  }

  let browser;
  try {
    // 启动浏览器
    browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const weeks = ['this', 'next'];

    for (const week of weeks) {
      console.log(`\n=============================`);
      console.log(`📅 正在扫描: week=${week}`);
      
      // 🔥 策略：每周创建一个新页面，防止混淆
      const page = await browser.newPage();
      
      try {
          // 开启日志
          page.on('console', msg => {
              if (msg.text().startsWith('DEBUG:')) console.log(msg.text());
          });

          // 3. 注入 Filter Cookie
          // 技巧：不限制货币 (删掉 currencies)，让网站返回所有，我们在 JS 里自己挑
          const filterConfig = encodeURIComponent(JSON.stringify({
            impacts: ["3"], // High Impact
            events: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"]
          }));
          
          await page.setCookie({
            name: 'ff_calendar_filters', 
            value: filterConfig, 
            domain: '.forexfactory.com', 
            path: '/', 
            expires: Math.floor(Date.now() / 1000) + 31536000
          });

          await page.goto(`https://www.forexfactory.com/calendar?week=${week}`, {
            waitUntil: 'networkidle2', timeout: 60000
          });

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
          
          await new Promise(r => setTimeout(r, 1500));

          const rawEvents = await page.evaluate(() => {
            const data = [];
            const rows = document.querySelectorAll('tr.calendar__row'); 
            
            let memDate = ""; 
            let memTime = ""; 
            
            console.log(`DEBUG: 页面总行数: ${rows.length}`); 

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
              // 检查是否红色 (High Impact)
              const isRed = impactEl && (impactEl.className.includes('impact-red') || impactEl.className.includes('high') || impactEl.className.includes('impact-3'));

              // 筛选逻辑：红色 + (USD 或 All 或 空货币堆叠)
              const isTargetCurrency = (rawCurrency === 'USD' || rawCurrency === 'All');
              const isStacked = (rawCurrency === '');

              if (isRed) {
                  if (isTargetCurrency || isStacked) {
                      data.push({
                          title, 
                          currency: rawCurrency || 'USD', // 如果是空的堆叠事件，默认归为USD
                          impact: 'High', 
                          rawDate: memDate, 
                          rawTime: memTime, // 注意：这里的 memTime 可能是 "Day 3"
                          forecast: getText('.calendar__forecast'), 
                          actual: getText('.calendar__actual'), 
                          previous: getText('.calendar__previous')
                      });
                  }
              } 
            });
            return data;
          });

          console.log(`📊 [${week}] 抓取结果: ${rawEvents.length} 条`);

          let savedCount = 0;
          for (const event of rawEvents) {
            
            // 🔥 修正点 1：删除了这里原本的 "if includes day continue" 代码
            if (!event.rawTime) continue; 

            const currentYear = new Date().getFullYear();
            const currentMonth = new Date().getMonth();
            let year = currentYear;
            
            if (event.rawDate.includes('Dec') && currentMonth === 0) year = currentYear - 1;
            else if (event.rawDate.includes('Jan') && currentMonth === 11) year = currentYear + 1;

            let timeStr = "";
            
            // 🔥 修正点 2：专门处理 "Day 3" 这种全天事件
            if (event.rawTime.toLowerCase().includes('day')) {
                 // 给全天事件一个默认时间，否则 Date 无法解析
                 timeStr = "12:00 am"; 
                 console.log(`ℹ️ [${week}] 发现全天事件: ${event.title}`);
            } else {
                 // 正常时间: 9:30pm -> 9:30 pm
                 timeStr = event.rawTime.replace(/(\d)(am|pm)/i, '$1 $2');
            }
            
            // 时区修正 (美国服务器 -0800)
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
          await page.close(); // 关闭页面，清理内存
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