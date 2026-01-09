const puppeteer = require('puppeteer');
const NewsEvent = require('../models/NewsEvent'); // 请确保这个路径指向您的 Model 文件

const scrapeForexFactory = async () => {
  console.log('🕷️ 启动爬虫: 正在启动浏览器 (历史+未来 双模式)...');

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    
    // 伪装 User Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });

    // 🔥 核心修改：定义要抓取的时间范围 ('last' = 上周/历史, 'this' = 本周/未来)
    const weeksToScrape = ['last', 'this'];

    for (const week of weeksToScrape) {
        console.log(`🌍 [${week.toUpperCase()}] 正在进入 Forex Factory (${week} week)...`);
        
        // 动态 URL
        await page.goto(`https://www.forexfactory.com/calendar?week=${week}`, {
          waitUntil: 'domcontentloaded',
          timeout: 60000
        });

        // 稍微等待页面加载
        await new Promise(r => setTimeout(r, 3000));

        // 2. 执行抓取
        const events = await page.evaluate(() => {
          const data = [];
          // 注意：我们在浏览器里只抓取 "Jan 5" 这种原始字符串，年份计算放回 Node环境 处理
          
          let globalDateStr = "";
          let globalTimeStr = ""; 

          const rows = document.querySelectorAll('tr.calendar__row'); // 更精确的选择器

          rows.forEach((row) => {
            // --- A. 更新日期 (记忆上一行的日期) ---
            const dateEl = row.querySelector('.calendar__date');
            let dateText = dateEl ? dateEl.innerText.replace(/[\n\r]+/g, ' ').trim() : "";
            if (dateText) globalDateStr = dateText; // 例如 "Sun Jan 5"

            // --- B. 更新时间 ---
            const timeEl = row.querySelector('.calendar__time');
            if (timeEl && timeEl.innerText.trim() !== '') {
                globalTimeStr = timeEl.innerText.trim(); // 例如 "9:30pm"
            }

            // --- 筛选逻辑 ---
            const currencyEl = row.querySelector('.calendar__currency');
            const titleEl = row.querySelector('.calendar__event-title'); // 注意这里用了更精确的 class
            const impactEl = row.querySelector('.calendar__impact span');

            if (!currencyEl || !titleEl) return;

            const currency = currencyEl.innerText.trim();
            const title = titleEl.innerText.trim();
            const impactClass = impactEl ? impactEl.className : "";

            // 只看 USD
            if (currency !== 'USD') return;

            // 筛选 High Impact 或 关键关键词
            const isHigh = impactClass.includes('high') || impactClass.includes('red') || 
                           title.includes('GDP') || title.includes('Unemployment') || 
                           title.includes('CPI') || title.includes('PPI') || title.includes('FOMC');
            
            if (!isHigh) return;

            const forecast = row.querySelector('.calendar__forecast')?.innerText.trim() || "";
            const previous = row.querySelector('.calendar__previous')?.innerText.trim() || "";
            const actual = row.querySelector('.calendar__actual')?.innerText.trim() || "";

            // 如果还没有日期或时间，跳过
            if (!globalDateStr) return;

            data.push({
              title,
              rawDate: globalDateStr, // 原始日期 "Sun Jan 5"
              rawTime: globalTimeStr, // 原始时间 "9:30pm"
              country: 'USD',
              impact: 'High',
              forecast,
              previous,
              actual
            });
          });

          return data;
        });

        if (events.length > 0) {
            console.log(`📊 [${week}] 捕获 ${events.length} 条数据。正在处理年份并同步...`);

            for (const event of events) {
              if (!event.rawTime || event.rawTime.includes('Day')) continue;

              // --- 📅 智能年份修正逻辑 ---
              const currentYear = new Date().getFullYear();
              const currentMonth = new Date().getMonth(); // 0 = Jan, 11 = Dec
              
              let eventYear = currentYear;

              // 检查：如果是 Jan 抓到了 Dec 的数据，说明是去年
              if (event.rawDate.includes('Dec') && currentMonth === 0) {
                  eventYear = currentYear - 1;
              }
              // 检查：如果是 Dec 抓到了 Jan 的数据（极少见），说明是明年
              else if (event.rawDate.includes('Jan') && currentMonth === 11) {
                  eventYear = currentYear + 1;
              }

              // 组合完整时间字符串: "Jan 5 2026 9:30pm"
              let fullDateString = `${event.rawDate} ${eventYear} ${event.rawTime}`;
              
              // 清理多余空格并转换 AM/PM 格式
              fullDateString = fullDateString.replace(/\s+/g, ' ').trim();
              fullDateString = fullDateString.replace(/(\d)(am|pm)/i, '$1 $2');

              const eventDate = new Date(fullDateString);

              if (isNaN(eventDate.getTime())) {
                console.log(`⚠️ 无效日期跳过: ${fullDateString}`);
                continue;
              }

              // --- 💾 存入数据库 (Upsert) ---
              // 使用 Title + Date 组合查询，防止重复
              await NewsEvent.findOneAndUpdate(
                { title: event.title, date: eventDate }, // 查找条件
                { 
                    title: event.title,
                    country: event.country,
                    date: eventDate,
                    impact: event.impact,
                    forecast: event.forecast,
                    previous: event.previous,
                    actual: event.actual,
                    // 注意：保留原有的 isAnalyzed 状态，或者设默认值
                    // $setOnInsert: { isAnalyzed: false } // 仅在插入新数据时设置
                }, 
                { upsert: true, new: true, setDefaultsOnInsert: true }
              );
            }
            console.log(`✅ [${week}] 数据同步完成！`);
        } else {
            console.warn(`⚠️ [${week}] 未发现相关数据。`);
        }
    } // 结束循环

    console.log("🎉 所有任务完成！数据库已包含 历史 + 未来 数据。");

  } catch (error) {
    console.error('❌ 爬虫严重错误:', error);
  } finally {
    if (browser) await browser.close();
  }
};

module.exports = scrapeForexFactory;