// ✅ 新增：引入 dotenv 管理环境变量
require('dotenv').config(); 

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const mongoose = require('mongoose');
const NewsEvent = require('../models/NewsEvent');

puppeteer.use(StealthPlugin());

const scrapeForexFactory = async () => {
  console.log('🕷️ 启动 V5.1 Server版...');

  // 1. 数据库连接
  if (mongoose.connection.readyState === 0) {
      console.log('⚠️ 建立数据库连接...');
      const dbUri = process.env.MONGO_URI || 'mongodb://localhost:27017/forex_data';
      await mongoose.connect(dbUri);
  }

  let browser;
  try {
    // ✅ 修复：浏览器启动配置大改
    browser = await puppeteer.launch({
      // 👇👇👇【关键新增】👇👇👇
      // 优先使用 Dockerfile 里定义的环境变量路径，本地开发则自动寻找默认路径
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),
      // 👆👆👆【关键新增】👆👆👆

      headless: 'new', 
      
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--disable-blink-features=AutomationControlled',
        
        // 风险解决 2：解决 Linux/Docker 环境下内存不足导致的崩溃
        '--disable-dev-shm-usage', 
        
        // 可选优化：减少服务器资源占用
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu', // 建议加上这个，服务器通常没有显卡
      ],
      defaultViewport: { width: 1920, height: 1080 }
    });

    const page = await browser.newPage();
    
    // 开启控制台日志桥接
    page.on('console', msg => {
        const text = msg.text();
        if (text.startsWith('DEBUG:')) console.log(text);
    });

    // 2. 注入 Filter Cookie (代码保持不变)
    const filterConfig = encodeURIComponent(JSON.stringify({
      impacts: ["3"], 
      currencies: ["USD"], 
      events: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"]
    }));
    
    await page.setCookie({
      name: 'ff_calendar_filters', 
      value: filterConfig, 
      domain: '.forexfactory.com', 
      path: '/', 
      expires: Math.floor(Date.now() / 1000) + 31536000
    });

    // ✅ 优化：为页面请求添加 User-Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    const weeks = ['this', 'last'];

    for (const week of weeks) {
      console.log(`\n📅 正在扫描 week=${week}`);
      
      await page.goto(`https://www.forexfactory.com/calendar?week=${week}`, {
        waitUntil: 'networkidle2', timeout: 60000
      });

      // ... 滚动逻辑 ... 
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

      // ... 抓取逻辑保持不变 ...
      const rawEvents = await page.evaluate(() => {
        const data = [];
        const rows = document.querySelectorAll('tr.calendar__row'); 
        let memDate = ""; 
        let memTime = ""; 
        
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
             } else if (rawCurrency === '' && isRed) {
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

      // ... 入库逻辑保持不变 ...
      let savedCount = 0;
      for (const event of rawEvents) {
        if (!event.rawTime || event.rawTime.toLowerCase().includes('day')) continue;
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth();
        let year = currentYear;
        if (event.rawDate.includes('Dec') && currentMonth === 0) year = currentYear - 1;
        else if (event.rawDate.includes('Jan') && currentMonth === 11) year = currentYear + 1;

        let dateStr = `${event.rawDate} ${year} ${event.rawTime}`.replace(/\s+/g, ' ').trim().replace(/(\d)(am|pm)/i, '$1 $2');
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
    }

  } catch (error) {
    console.error('❌ 发生错误:', error);
  } finally {
    if (browser) await browser.close();
    console.log('👋 任务结束');
  }
};

module.exports = scrapeForexFactory;