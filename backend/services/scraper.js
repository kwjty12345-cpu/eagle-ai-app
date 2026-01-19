const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const mongoose = require('mongoose');
const NewsEvent = require('../models/NewsEvent');

puppeteer.use(StealthPlugin());

const scrapeForexFactory = async () => {
  console.log('🕷️ 启动 V5.5 稳健版 (修复WEF + 独立页面抓取下周 + 时差修正)...');

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

    // 定义要抓取的周数
    const weeks = ['this', 'next'];

    for (const week of weeks) {
      console.log(`\n=============================`);
      console.log(`📅 正在初始化页面以扫描: week=${week}`);
      console.log(`=============================`);

      // 🔥 关键改进：每抓一周，都创建一个全新的 Page
      // 这能防止上一周的滚动条状态、DOM残留影响到下一周
      const page = await browser.newPage();

      try {
        // 开启日志
        page.on('console', msg => {
            const text = msg.text();
            if (text.startsWith('DEBUG:')) console.log(text);
        });

        // 注入 Cookie (每次新页面都重新注入，确保Filter生效)
        const filterConfig = encodeURIComponent(JSON.stringify({
          impacts: ["3"], // High Impact
          events: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"]
          // currencies: [] // 不限制货币，由JS过滤
        }));
        
        await page.setCookie({
          name: 'ff_calendar_filters', 
          value: filterConfig, 
          domain: '.forexfactory.com', 
          path: '/', 
          expires: Math.floor(Date.now() / 1000) + 31536000
        });

        // 跳转
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
                    // 滚动到底部或超过一定高度
                    if(totalHeight >= scrollHeight - window.innerHeight){
                        clearInterval(timer);
                        resolve();
                    }
                }, 50); 
            });
        });
        
        await new Promise(r => setTimeout(r, 1500)); //稍微多等一点时间

        // 抓取数据
        const rawEvents = await page.evaluate(() => {
          const data = [];
          const rows = document.querySelectorAll('tr.calendar__row'); 
          
          let memDate = ""; 
          let memTime = ""; 
          
          console.log(`DEBUG: [${document.title}] 页面总行数: ${rows.length}`); 

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

            // 筛选逻辑：红色 + (USD 或 All 或 空货币堆叠)
            const isTargetCurrency = (rawCurrency === 'USD' || rawCurrency === 'All');
            
            if (isRed) {
                if (isTargetCurrency) {
                    data.push({
                        title, currency: rawCurrency, impact: 'High', 
                        rawDate: memDate, rawTime: memTime, 
                        forecast: getText('.calendar__forecast'), 
                        actual: getText('.calendar__actual'), 
                        previous: getText('.calendar__previous')
                    });
                }
                else if (rawCurrency === '') { // 堆叠事件
                    data.push({
                        title, currency: 'USD', impact: 'High', 
                        rawDate: memDate, rawTime: memTime, 
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
          
          // 处理 "Day 3" 或其他全天事件
          if (event.rawTime.toLowerCase().includes('day')) {
               timeStr = "12:00 am";
               console.log(`ℹ️ [${week}] 全天事件: ${event.title}`);
          } else {
               timeStr = event.rawTime.replace(/(\d)(am|pm)/i, '$1 $2');
          }
          
          // 时区修正 (-0800 PST)
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
        console.error(`❌ [${week}] 扫描失败:`, err);
      } finally {
        // 🔥 这一步很重要：抓完一周，关闭页面，释放内存，确保下一周是干净的
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