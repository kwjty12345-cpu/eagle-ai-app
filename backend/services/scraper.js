const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const mongoose = require('mongoose');
const NewsEvent = require('../models/NewsEvent');

puppeteer.use(StealthPlugin());

const scrapeForexFactory = async () => {
  console.log('🕷️ 启动 V5.0 稳定版 (修复 Timeout + 自动滚动检测 + 时区修正)...');

  // 1. 数据库连接
  if (mongoose.connection.readyState === 0) {
      console.log('⚠️ 建立临时数据库连接...');
      await mongoose.connect('mongodb://localhost:27017/forex_data');
  }

  let browser;
  try {
    // ============================================================
    // 1. 启动浏览器 (配置修正版)
    // ============================================================
    browser = await puppeteer.launch({
      headless: true, // 或者是 "new"
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--timezone=Asia/Kuala_Lumpur' // 👈 告诉浏览器引擎我们在吉隆坡
      ],
      env: {
        ...process.env,
        TZ: 'Asia/Kuala_Lumpur' // 👈 告诉 Node 环境我们在吉隆坡
      }
    }); // <--- 注意：这里必须把 launch 的括号闭合

    // ============================================================
    // 2. 创建页面并应用时区
    // ============================================================
    const page = await browser.newPage();
    
    // 👈 双重保险：强制页面逻辑使用吉隆坡时间
    await page.emulateTimezone('Asia/Kuala_Lumpur');

    // 开启控制台日志桥接
    page.on('console', msg => {
        const text = msg.text();
        if (text.startsWith('DEBUG:')) console.log(text);
    });

    // 3. 注入 Filter Cookie (只看 USD + High)
    const filterConfig = encodeURIComponent(JSON.stringify({
      impacts: ["3"], // High Impact
      currencies: ["USD"], // USD Only
      events: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"]
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
      console.log('🖱️ 正在自动滚动页面，确保所有数据加载...');
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
      // 🕵️ 开始抓取逻辑
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

          // 记忆逻辑
          if (rawDate && rawDate.length > 1) memDate = rawDate;
          if (rawTime && rawTime.length > 1) memTime = rawTime;

          if (!title) return; 

          // 1. 获取图标 Class (判断颜色)
          const impactEl = row.querySelector('.calendar__impact .icon');
          const iconClass = impactEl ? impactEl.className : "";
          const isRed = iconClass.includes('impact-red') || iconClass.includes('high') || iconClass.includes('impact-3');

          // 2. 诊断日志
          if (rawCurrency === 'USD') {
              if (isRed) {
                  console.log(`DEBUG: [Row ${index}] ✅ 捕获: ${title} (${memDate} ${memTime})`);
                  data.push({
                      title, currency: 'USD', impact: 'High', 
                      rawDate: memDate, rawTime: memTime, 
                      forecast: getText('.calendar__forecast'), 
                      actual: getText('.calendar__actual'), 
                      previous: getText('.calendar__previous')
                  });
              }
          } 
          // 3. 处理堆叠事件
          else if (rawCurrency === '' && isRed) {
              console.log(`DEBUG: [Row ${index}] ✅ 捕获(堆叠): ${title}`);
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

      // 入库
      let savedCount = 0;
      for (const event of rawEvents) {
        if (!event.rawTime || event.rawTime.toLowerCase().includes('day')) continue;

        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth();
        let year = currentYear;
        
        // 跨年逻辑处理
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