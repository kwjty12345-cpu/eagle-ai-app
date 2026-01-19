const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const mongoose = require('mongoose');
const NewsEvent = require('../models/NewsEvent');

puppeteer.use(StealthPlugin());

const scrapeForexFactory = async () => {
  console.log('🕷️ 启动 V5.2 最终修正版 (抓取 USD + All, 修复美国时差)...');

  // 1. 数据库连接
  if (mongoose.connection.readyState === 0) {
      console.log('⚠️ 建立临时数据库连接...');
      await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/forex_data');
  }

  let browser;
  try {
    // 启动浏览器 (移除 timezone args，直接让 FF 根据服务器IP(美国)显示时间)
    browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    
    // 开启控制台日志，方便调试
    page.on('console', msg => {
        const text = msg.text();
        if (text.startsWith('DEBUG:')) console.log(text);
    });

    // ============================================================
    // 3. 注入 Filter Cookie (关键修改!)
    // ============================================================
    // ❌ 之前的问题：ForexFactory 不识别 currencies: ["USD", "All"] 这种组合，可能导致返回0条。
    // ✅ 解决方案：Cookie 里完全不写 currencies (代表请求所有货币)，我们在代码里自己挑 USD 和 All。
    const filterConfig = encodeURIComponent(JSON.stringify({
      impacts: ["3"], // 只看红色 (High Impact)
      events: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"] // 保留你的事件ID过滤
      // currencies: ... 👈 删掉这行，让网站返回所有货币，防止漏掉 "All"
    }));
    
    await page.setCookie({
      name: 'ff_calendar_filters', 
      value: filterConfig, 
      domain: '.forexfactory.com', 
      path: '/', 
      expires: Math.floor(Date.now() / 1000) + 31536000
    });

    // 扫描本周和下周 (持续更新)
    const weeks = ['this', 'next'];

    for (const week of weeks) {
      console.log(`\n📅 正在扫描 week=${week}`);
      
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
      
      await new Promise(r => setTimeout(r, 1000));

      // ============================================================
      // 🕵️ 抓取与筛选
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
          let rawCurrency = getText('.calendar__currency'); // 这里现在会抓到 EUR, GBP, USD, All 等
          const title = getText('.calendar__event-title');

          if (rawDate && rawDate.length > 1) memDate = rawDate;
          if (rawTime && rawTime.length > 1) memTime = rawTime;

          if (!title) return; 

          const impactEl = row.querySelector('.calendar__impact .icon');
          const iconClass = impactEl ? impactEl.className : "";
          const isRed = iconClass.includes('impact-red') || iconClass.includes('high') || iconClass.includes('impact-3');

          // ✅ 核心过滤逻辑：只在 JS 里过滤
          // 只要是红色，并且货币是 (USD 或 All 或 空-堆叠事件)，就保留
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
              // 处理堆叠事件 (货币栏为空，通常继承上一行)
              // 例如 PMI 数据经常堆叠显示，必须保留
              else if (rawCurrency === '') {
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

      console.log(`📊 [${week}] 抓取结果: ${rawEvents.length} 条`);

      let savedCount = 0;
      for (const event of rawEvents) {
        if (!event.rawTime || event.rawTime.toLowerCase().includes('day')) continue;

        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth();
        let year = currentYear;
        
        // 跨年处理
        if (event.rawDate.includes('Dec') && currentMonth === 0) year = currentYear - 1;
        else if (event.rawDate.includes('Jan') && currentMonth === 11) year = currentYear + 1;

        let timeStr = event.rawTime.replace(/(\d)(am|pm)/i, '$1 $2');
        
        // 🔥🔥🔥 核心时间修正 🔥🔥🔥
        // 1. 爬下来的 "5:30am" 是美国时间 (PST)。
        // 2. 我们拼接 "-0800"。
        // 3. new Date() 会把它自动转成 UTC。
        // 4. 当你在马来西亚前端显示时，它会自动 +8，变成 21:30 (9:30 PM)。
        let dateStr = `${event.rawDate} ${year} ${timeStr} -0800`;
        
        const dateObj = new Date(dateStr);

        if (!isNaN(dateObj.getTime())) {
           // 存入数据库
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