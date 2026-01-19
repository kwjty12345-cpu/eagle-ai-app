const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const mongoose = require('mongoose');
const NewsEvent = require('../models/NewsEvent');

puppeteer.use(StealthPlugin());

const scrapeForexFactory = async () => {
  console.log('🕷️ 启动 V5.1 修正版 (修复美国时区 + WEF漏抓)...');

  if (mongoose.connection.readyState === 0) {
      console.log('⚠️ 建立临时数据库连接...');
      await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/forex_data');
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        // '--timezone=Asia/Kuala_Lumpur' // ❌ 删掉这行，既然服务器是美国IP，强制浏览器的时区也没用，FF是根据IP给时间的
      ],
      // ❌ env 里的 TZ 也可以去掉，或者留着也没事，关键是下面的解析逻辑
    });

    const page = await browser.newPage();
    
    // 开启日志
    page.on('console', msg => {
        const text = msg.text();
        if (text.startsWith('DEBUG:')) console.log(text);
    });

    // 3. 注入 Filter Cookie
    const filterConfig = encodeURIComponent(JSON.stringify({
      impacts: ["3"], // High Impact
      currencies: ["USD", "All"], // ✅ 修改1: 加上 "All"，否则 WEF 这种全球会议会被漏掉
      events: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"] 
    }));
    
    await page.setCookie({
      name: 'ff_calendar_filters', 
      value: filterConfig, 
      domain: '.forexfactory.com', 
      path: '/', 
      expires: Math.floor(Date.now() / 1000) + 31536000
    });

    const weeks = ['this', 'next']; // 建议改为 this 和 next，防止周日漏掉下周一的数据

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

          // ✅ 修改2: 允许 USD 或者 All (WEF 会议)
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
              // 处理堆叠事件 (继承上一行的货币)
              else if (rawCurrency === '') {
                 // 这里简单处理，假设堆叠的都是我们想要的，或者你可以加逻辑判断 memCurrency
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
        
        if (event.rawDate.includes('Dec') && currentMonth === 0) year = currentYear - 1;
        else if (event.rawDate.includes('Jan') && currentMonth === 11) year = currentYear + 1;

        let timeStr = event.rawTime.replace(/(\d)(am|pm)/i, '$1 $2');
        
        // ✅ 修改3: 核心修复！将 +0800 改为 -0800
        // 解释：因为爬下来的 "5:30am" 是美国时间(PST)。
        // 我们告诉 Date 对象："这是 -0800 时区的时间"。
        // Date 对象会自动把它换算成 UTC，当你前端显示时，它就会自动变回 9:30 PM (KL时间)
        let dateStr = `${event.rawDate} ${year} ${timeStr} -0800`;
        
        const dateObj = new Date(dateStr);

        if (!isNaN(dateObj.getTime())) {
           await NewsEvent.findOneAndUpdate(
            { title: event.title, date: dateObj }, // 这样能避免重复，但建议最好先清库
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