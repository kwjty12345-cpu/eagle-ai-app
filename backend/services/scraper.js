const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const mongoose = require('mongoose');
const NewsEvent = require('../models/NewsEvent');

puppeteer.use(StealthPlugin());

const scrapeForexFactory = async () => {
  console.log('🕷️ 启动 V5.0 稳定版 (仅修复时差，保留Filter)...');

  // 1. 数据库连接
  if (mongoose.connection.readyState === 0) {
      console.log('⚠️ 建立临时数据库连接...');
      await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/forex_data');
  }

  let browser;
  try {
    // ============================================================
    // 1. 启动浏览器
    // ============================================================
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--timezone=Asia/Kuala_Lumpur'
      ],
      env: {
        ...process.env,
        TZ: 'Asia/Kuala_Lumpur'
      }
    });

    // ============================================================
    // 2. 创建页面
    // ============================================================
    const page = await browser.newPage();
    
    // 强制页面使用吉隆坡时间
    await page.emulateTimezone('Asia/Kuala_Lumpur');

    // 开启日志
    page.on('console', msg => {
        const text = msg.text();
        if (text.startsWith('DEBUG:')) console.log(text);
    });

    // 3. 注入 Filter Cookie (完全保留你原本的设置)
    const filterConfig = encodeURIComponent(JSON.stringify({
      impacts: ["3"], // High Impact
      currencies: ["USD"], // USD Only
      events: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"] // 👈 保留了你的事件ID过滤
    }));
    
    await page.setCookie({
      name: 'ff_calendar_filters', 
      value: filterConfig, 
      domain: '.forexfactory.com', 
      path: '/', 
      expires: Math.floor(Date.now() / 1000) + 31536000
    });

    const weeks = ['this', 'last'];

    for (const week of weeks) {
      console.log(`\n📅 正在扫描 week=${week}`);
      
      await page.goto(`https://www.forexfactory.com/calendar?week=${week}`, {
        waitUntil: 'networkidle2', timeout: 60000
      });

      // ============================================================
      // 🖱️ 动作：自动滚动页面
      // ============================================================
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
      
      await new Promise(r => setTimeout(r, 1000));

      // ============================================================
      // 🕵️ 抓取逻辑
      // ============================================================
      const rawEvents = await page.evaluate(() => {
        const data = [];
        const rows = document.querySelectorAll('tr.calendar__row'); 
        
        let memDate = ""; 
        let memTime = ""; 
        
        console.log(`DEBUG: 页面总行数: ${rows.length}`);

        rows.forEach((row, index) => {
          const getText = (s) => { const el = row.querySelector(s); return el ? el.textContent.trim() : ""; };
          
          let rawDate = getText('.calendar__date');
          let rawTime = getText('.calendar__time');
          let rawCurrency = getText('.calendar__currency');
          const title = getText('.calendar__event-title');

          if (rawDate && rawDate.length > 1) memDate = rawDate;
          if (rawTime && rawTime.length > 1) memTime = rawTime;

          if (!title) return; 

          const impactEl = row.querySelector('.calendar__impact .icon');
          const iconClass = impactEl ? impactEl.className : "";
          const isRed = iconClass.includes('impact-red') || iconClass.includes('high') || iconClass.includes('impact-3');

          if (rawCurrency === 'USD') {
              if (isRed) {
                  data.push({
                      title, currency: 'USD', impact: 'High', 
                      rawDate: memDate, rawTime: memTime, 
                      forecast: getText('.calendar__forecast'), 
                      actual: getText('.calendar__actual'), 
                      previous: getText('.calendar__previous')
                  });
              }
          } 
          else if (rawCurrency === '' && isRed) {
              data.push({
                  title, currency: 'USD', impact: 'High', 
                  rawDate: memDate, rawTime: memTime, 
                  forecast: getText('.calendar__forecast'), 
                  actual: getText('.calendar__actual'), 
                  previous: getText('.calendar__previous')
              });
          }
        });
        return data;
      });

      console.log(`📊 [${week}] 抓取结果: ${rawEvents.length} 条`);

      // ============================================================
      // 💾 入库逻辑 (🔥 重点修改了这里 🔥)
      // ============================================================
      let savedCount = 0;
      for (const event of rawEvents) {
        if (!event.rawTime || event.rawTime.toLowerCase().includes('day')) continue;

        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth();
        let year = currentYear;
        
        if (event.rawDate.includes('Dec') && currentMonth === 0) year = currentYear - 1;
        else if (event.rawDate.includes('Jan') && currentMonth === 11) year = currentYear + 1;

        // 🔥🔥🔥 核心修改开始 🔥🔥🔥
        // 1. 把 9:30pm 变成 9:30 pm (加空格)
        let timeStr = event.rawTime.replace(/(\d)(am|pm)/i, '$1 $2');
        
        // 2. 强制加上 "+0800"
        // 这样 Node.js 就会知道 "这个 9:30pm 是马来西亚时间"，而不是 UTC
        let dateStr = `${event.rawDate} ${year} ${timeStr} +0800`;
        
        const dateObj = new Date(dateStr);
        // 🔥🔥🔥 核心修改结束 🔥🔥🔥

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
    }

  } catch (error) {
    console.error('❌ 发生错误:', error);
  } finally {
    if (browser) await browser.close();
    console.log('👋 任务结束');
  }
};

module.exports = scrapeForexFactory;