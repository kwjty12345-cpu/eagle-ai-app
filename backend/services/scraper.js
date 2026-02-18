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
    // 浏览器启动配置
    browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),
      headless: 'new', 
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage', 
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu', 
      ],
      defaultViewport: { width: 1920, height: 1080 }
    });

    const page = await browser.newPage();
    
    // 开启控制台日志桥接
    page.on('console', msg => {
        const text = msg.text();
        if (text.startsWith('DEBUG:')) console.log(text);
    });

    // 2. 注入 Filter Cookie
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

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    const weeks = ['this', 'last'];

    for (const week of weeks) {
      console.log(`\n📅 正在扫描 week=${week}`);
      
      await page.goto(`https://www.forexfactory.com/calendar?week=${week}`, {
        waitUntil: 'networkidle2', timeout: 60000
      });

      // ✅ 修改部分 1：增加表格加载等待，防止网络慢或被 Cloudflare 拦截导致抓取空数据
      try {
          console.log('⏳ 等待日历表格加载...');
          // 等待日历主表格出现，最多等 15 秒
          await page.waitForSelector('.calendar__table', { timeout: 15000 });
      } catch (e) {
          console.log(`⚠️ [${week}] 找不到日历表格！可能被反爬虫拦截或加载超时。跳过本周。`);
          continue; // 直接跳过本周的数据抓取，不让程序崩溃
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
      await new Promise(r => setTimeout(r, 1000));

      // ✅ 修改部分 2：更新 DOM 选择器，兼容多种类名写法
      const rawEvents = await page.evaluate(() => {
        const data = [];
        // 兼容带双下划线和单下划线/无下划线的行写法
        const rows = document.querySelectorAll('tr.calendar__row, tr.calendar_row'); 
        let memDate = ""; 
        let memTime = ""; 
        
        rows.forEach((row) => {
             // 优化获取文本的函数，自动清理多余的换行符和空格
             const getText = (s) => { 
                 const el = row.querySelector(s); 
                 return el ? el.textContent.replace(/\s+/g, ' ').trim() : ""; 
             };

             // 增加备用选择器
             let rawDate = getText('td.calendar__date, td.date');
             let rawTime = getText('td.calendar__time, td.time');
             let rawCurrency = getText('td.calendar__currency, td.currency');
             const title = getText('td.calendar__event span, td.event span, td.calendar__event, td.event');
             
             if (rawDate && rawDate.length > 1) memDate = rawDate;
             if (rawTime && rawTime.length > 1) memTime = rawTime;
             
             if (!title) return; // 如果没有标题，跳过该行

             // 优化 Impact (影响力) 的判断逻辑
             const impactEl = row.querySelector('td.calendar__impact span, td.impact span, .calendar__impact .icon');
             const iconClass = impactEl ? impactEl.className.toLowerCase() : "";
             const isRed = iconClass.includes('red') || iconClass.includes('high') || iconClass.includes('impact-3');

             if ((rawCurrency === 'USD' && isRed) || (rawCurrency === '' && isRed)) {
                 data.push({
                     title, 
                     currency: 'USD', 
                     impact: 'High', 
                     rawDate: memDate, 
                     rawTime: memTime, 
                     forecast: getText('td.calendar__forecast, td.forecast'), 
                     actual: getText('td.calendar__actual, td.actual'), 
                     previous: getText('td.calendar__previous, td.previous')
                 });
             }
        });
        return data;
      });

      console.log(`📊 [${week}] 抓取结果: ${rawEvents.length} 条`);

      // 3. 数据库入库逻辑保持不变
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