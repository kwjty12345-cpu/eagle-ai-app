const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const mongoose = require('mongoose');
const NewsEvent = require('../models/NewsEvent');

puppeteer.use(StealthPlugin());

const scrapeForexFactory = async () => {
  console.log('🕷️ 启动 V5.3 最终修正版 (抓取 USD + All + 修复 Railway 时差)...');

  // 1. 数据库连接
  if (mongoose.connection.readyState === 0) {
      console.log('⚠️ 建立临时数据库连接...');
      await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/forex_data');
  }

  let browser;
  try {
    // 启动浏览器 (无需 emulateTimezone args，因为 Railway IP 本身就是美国)
    browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    
    // 开启日志
    page.on('console', msg => {
        const text = msg.text();
        if (text.startsWith('DEBUG:')) console.log(text);
    });

    // ============================================================
    // 3. 注入 Filter Cookie (关键修改!)
    // ============================================================
    // 解释：为了不漏掉 "WEF" (All 货币)，我们不能在 Cookie 里写 currencies: ["USD"]。
    // 我们让网站返回所有货币，然后在下面的 JS 代码里精准筛选。
    const filterConfig = encodeURIComponent(JSON.stringify({
      impacts: ["3"], // High Impact (红色)
      events: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"] // 保留你的事件ID过滤
      // currencies: [] 👈 故意删掉这行，让它返回 USD, EUR, All 等所有数据
    }));
    
    await page.setCookie({
      name: 'ff_calendar_filters', 
      value: filterConfig, 
      domain: '.forexfactory.com', 
      path: '/', 
      expires: Math.floor(Date.now() / 1000) + 31536000
    });

    // ✅ 修改：为了持续使用，抓取 "本周" 和 "下周" (预测未来需要下周数据)
    // 如果你需要历史数据训练 AI，可以加上 'last' -> ['last', 'this', 'next']
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
          let rawCurrency = getText('.calendar__currency'); 
          const title = getText('.calendar__event-title');

          if (rawDate && rawDate.length > 1) memDate = rawDate;
          if (rawTime && rawTime.length > 1) memTime = rawTime;

          if (!title) return; 

          const impactEl = row.querySelector('.calendar__impact .icon');
          const iconClass = impactEl ? impactEl.className : "";
          const isRed = iconClass.includes('impact-red') || iconClass.includes('high') || iconClass.includes('impact-3');

          // ✅ 这里的逻辑实现了你的 Filter 需求：
          // 虽然 Cookie 拿回了所有货币，但我们只把 USD 和 All 存进数组
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
              // 处理堆叠事件 (例如 9:30pm 有两个 USD 事件，第二个通常没有货币符号)
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
        
        // 🔥🔥🔥 核心修复 🔥🔥🔥
        // 1. 爬虫在 Railway (美国) 看到的 "5:30am" 是美国时间。
        // 2. 我们把它标记为 "-0800" (美国西海岸时区)。
        // 3. 数据库会把它存为标准 UTC 时间。
        // 4. 当你的前端 (在马来西亚) 读取时，它会自动 +8 小时，变回正确的 21:30 (9:30 PM)。
        let dateStr = `${event.rawDate} ${year} ${timeStr} -0800`;
        
        const dateObj = new Date(dateStr);

        if (!isNaN(dateObj.getTime())) {
           // 存入数据库 (使用 title+date 作为唯一标识，防止重复插入)
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