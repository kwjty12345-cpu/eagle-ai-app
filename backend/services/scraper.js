const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const mongoose = require('mongoose');
const NewsEvent = require('../models/NewsEvent');

puppeteer.use(StealthPlugin());

const scrapeForexFactory = async () => {
  console.log('🕷️ 启动 V5.7 终极融合版 (WEF全天事件 + 下周独立抓取 + 时区修复)...');

  // 1. 数据库连接
  if (mongoose.connection.readyState === 0) {
      console.log('⚠️ 建立临时数据库连接...');
      await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/forex_data');
  }

  // 🔥 建议：每次启动爬虫前清空旧数据，防止"错误时间"和"正确时间"的数据并存
  // Uncomment next line if you want to auto-clear DB on every run
  // await NewsEvent.deleteMany({}); console.log('🧹 已清空旧数据，准备存入新数据...');

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

      // 🔥 核心策略 1 (来自 V5.5)：
      // 每抓一周，都创建一个全新的 Page。这能防止上一周的 DOM 残留影响到下一周。
      const page = await browser.newPage();

      try {
        // 开启日志
        page.on('console', msg => {
            const text = msg.text();
            if (text.startsWith('DEBUG:')) console.log(text);
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
                    if(totalHeight >= scrollHeight - window.innerHeight){
                        clearInterval(timer);
                        resolve();
                    }
                }, 50); 
            });
        });
        
        await new Promise(r => setTimeout(r, 1500)); // 等待懒加载完成

        // ============================================================
        // 🕵️ 抓取逻辑
        // ============================================================
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

            // 筛选逻辑：红色 + (USD 或 All 或 空货币堆叠)
            const isTargetCurrency = (rawCurrency === 'USD' || rawCurrency === 'All');
            const isStacked = (rawCurrency === '');

            if (isRed) {
                if (isTargetCurrency || isStacked) {
                    data.push({
                        title, 
                        currency: rawCurrency || 'USD', // 堆叠事件默认 USD
                        impact: 'High', 
                        rawDate: memDate, 
                        rawTime: memTime, // 这里可能是 "9:30pm" 也可能是 "Day 3"
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
          
          // 🔥 核心策略 2 (来自 V5.6)：
          // 绝对不要写 "if includes day continue"，否则 WEF 就会被删掉！
          if (!event.rawTime) continue; 

          const currentYear = new Date().getFullYear();
          const currentMonth = new Date().getMonth();
          let year = currentYear;
          
          // 跨年处理
          if (event.rawDate.includes('Dec') && currentMonth === 0) year = currentYear - 1;
          else if (event.rawDate.includes('Jan') && currentMonth === 11) year = currentYear + 1;

          let timeStr = "";
          
          // 🔥 核心处理：全天事件 (Day X)
          if (event.rawTime.toLowerCase().includes('day')) {
               // 给它一个默认时间，比如凌晨 12:00 am，这样才能存进 Date 对象
               timeStr = "12:00 am";
               console.log(`ℹ️ [${week}] 全天事件入库: ${event.title} (设为 12:00 am)`);
          } else {
               // 正常时间: 9:30pm -> 9:30 pm
               timeStr = event.rawTime.replace(/(\d)(am|pm)/i, '$1 $2');
          }
          
          // 时区修正：因为 Railway 在美国 (-0800 PST)
          // 存入后，前端显示会自动 +8 小时
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

      } catch (err) {
        console.error(`❌ [${week}] 扫描失败:`, err);
      } finally {
        // 🔥 关键：每一周抓完必须关闭页面，释放内存
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