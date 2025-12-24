const puppeteer = require('puppeteer');
const NewsEvent = require('../models/NewsEvent');

const scrapeForexFactory = async () => {
  console.log('🕷️ 启动爬虫: 正在启动浏览器 (增量更新模式)...');

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    
    // 伪装
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });

    console.log('🌍 正在进入 Forex Factory...');
    // 依然抓取本周数据，用来更新 Forecast/Actual
    await page.goto('https://www.forexfactory.com/calendar?this_week=1', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    await new Promise(r => setTimeout(r, 3000));

    // 2. 执行抓取
    const events = await page.evaluate(() => {
      const data = [];
      const currentYear = new Date().getFullYear();
      
      let globalDateStr = "";
      let globalTimeStr = ""; 

      const rows = document.querySelectorAll('tr');

      rows.forEach((row) => {
        // --- A. 更新日期 ---
        const dateEl = row.querySelector('.calendar__date');
        let dateText = dateEl ? dateEl.innerText.replace(/[\n\r]+/g, ' ').trim() : "";
        if (dateText) globalDateStr = dateText;

        // --- B. 更新时间 ---
        const fullRowText = row.innerText;
        const timeMatch = fullRowText.match(/(\d{1,2}:\d{2})\s*([ap]m)/i);
        if (timeMatch) globalTimeStr = `${timeMatch[1]} ${timeMatch[2]}`;

        // --- 筛选逻辑 ---
        const currencyEl = row.querySelector('.calendar__currency');
        const titleEl = row.querySelector('.calendar__event-title');
        const impactEl = row.querySelector('.calendar__impact span');

        if (!currencyEl || !titleEl) return;

        const currency = currencyEl.innerText.trim();
        const title = titleEl.innerText.trim();
        const impactClass = impactEl ? impactEl.className : "";

        if (currency !== 'USD') return;

        // 保留 High Impact, GDP, Unemployment, CPI 等关键数据
        const isHigh = impactClass.includes('high') || impactClass.includes('red') || title.includes('GDP') || title.includes('Unemployment') || title.includes('CPI') || title.includes('PPI');
        
        if (!isHigh) return;

        const forecast = row.querySelector('.calendar__forecast')?.innerText.trim() || "";
        const previous = row.querySelector('.calendar__previous')?.innerText.trim() || "";
        const actual = row.querySelector('.calendar__actual')?.innerText.trim() || "";

        data.push({
          title,
          dateStr: `${globalDateStr} ${currentYear} ${globalTimeStr}`,
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
        console.log(`📊 扫描完成，捕获 ${events.length} 条数据。正在同步数据库...`);

        // ⚠️ 关键修改：不再清空数据库！而是使用 Upsert (有则更新，无则插入)
        // 这样可以保留上一周、上上周的历史数据
        
        for (const event of events) {
          if (event.dateStr.includes('Day')) continue;

          let cleanDateStr = event.dateStr.replace(/\s+/g, ' ').trim();
          cleanDateStr = cleanDateStr.replace(/(\d)(am|pm)/i, '$1 $2');

          const eventDate = new Date(cleanDateStr);

          if (isNaN(eventDate.getTime())) {
            continue;
          }

          // 使用 Title + Date 作为唯一标识，防止重复插入
          await NewsEvent.findOneAndUpdate(
            { title: event.title, date: eventDate }, // 查询条件
            { ...event, date: eventDate },           // 更新内容
            { upsert: true, new: true }              // 选项：如果不存在就创建
          );
        }
        console.log("🎉 数据库同步完成 (历史数据已保留)！");
    } else {
        console.warn("⚠️ 本次爬取未发现数据。");
    }

  } catch (error) {
    console.error('❌ 爬虫出错:', error);
  } finally {
    if (browser) await browser.close();
  }
};

module.exports = scrapeForexFactory;