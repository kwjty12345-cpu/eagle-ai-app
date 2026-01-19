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
      await mongoose.connect(process.env.MONGO_URI);
  }

  let browser;
  try {
    // ============================================================
    // 1. 启动浏览器 (配置修正版)
    // ============================================================
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--timezone=Asia/Kuala_Lumpur' // 👈 告诉浏览器引擎我们在吉隆坡
      ],
      env: {
        ...process.env,
        TZ: 'Asia/Kuala_Lumpur' // 👈 告诉 Node 环境我们在吉隆坡
      }
    });

    // ============================================================
    // 2. 创建页面并应用时区
    // ============================================================
    const page = await browser.newPage();
    
    // 🔥 核心修复：强制页面逻辑使用吉隆坡时间
    // 这会让 Forex Factory 认为用户就在马来西亚，从而显示 9:30pm 而不是 5:30am
    await page.emulateTimezone('Asia/Kuala_Lumpur');

    // 开启控制台日志桥接
    page.on('console', msg => {
        const text = msg.text();
        if (text.startsWith('DEBUG:')) console.log(text);
    });

    // 3. 注入 Filter Cookie (只看 High Impact，不限制货币以免漏掉 "All")
    // 我们在代码里再过滤 USD，这样更灵活
    const filterConfig = encodeURIComponent(JSON.stringify({
      impacts: ["3"], // High Impact (红色)
      events: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"]
    }));
    
    await page.setCookie({
      name: 'ff_calendar_filters', 
      value: filterConfig, 
      domain: '.forexfactory.com', 
      path: '/', 
      expires: Math.floor(Date.now() / 1000) + 31536000
    });

    const weeks = ['this', 'next']; // 建议扫描本周和下周

    for (const week of weeks) {
      console.log(`\n📅 正在扫描 week=${week}`);
      
      await page.goto(`https://www.forexfactory.com/calendar?week=${week}`, {
        waitUntil: 'networkidle2', timeout: 60000
      });

      // ============================================================
      // 🖱️ 动作：自动滚动页面 (确保懒加载数据出现)
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
      // 🕵️ 开始抓取逻辑
      // ============================================================
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

          // 记忆逻辑 (处理堆叠显示的日期/时间)
          if (rawDate && rawDate.length > 1) memDate = rawDate;
          if (rawTime && rawTime.length > 1) memTime = rawTime;

          if (!title) return; 

          // 1. 获取图标 Class (判断颜色)
          const impactEl = row.querySelector('.calendar__impact .icon');
          const iconClass = impactEl ? impactEl.className : "";
          const isRed = iconClass.includes('impact-red') || iconClass.includes('high') || iconClass.includes('impact-3');

          // 🔥 核心修复：允许 USD 和 "All" (针对 WEF 会议等)
          // 逻辑：如果是红色新闻，并且 (货币是USD 或 货币是All 或 货币为空但也是红色堆叠事件)
          if (isRed) {
              const isTargetCurrency = (rawCurrency === 'USD' || rawCurrency === 'All');
              const isStacked = (rawCurrency === ''); // 堆叠事件通常继承上一行，这里简化处理

              if (isTargetCurrency || isStacked) {
                  // 如果是堆叠的，且上一行不是USD/All，这里可能会误抓，但在USD为主的过滤下问题不大
                  // 为了更精准，可以在这里判断 memTime 是否有效
                  data.push({
                      title, 
                      currency: rawCurrency || 'USD', // 默认为 USD
                      impact: 'High', 
                      rawDate: memDate, 
                      rawTime: memTime, 
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

      // 入库
      let savedCount = 0;
      for (const event of rawEvents) {
        // 跳过没有时间或者是 "Day x" 的全天事件 (如果你不想抓全天事件)
        // 如果想抓 WEF (Day 3)，需要特殊处理时间，这里暂时跳过非具体时间的事件以防报错
        if (!event.rawTime || event.rawTime.toLowerCase().includes('day')) {
             console.log(`⚠️ 跳过非具体时间事件: ${event.title} (${event.rawTime})`);
             continue;
        }

        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth();
        let year = currentYear;
        
        // 跨年逻辑
        if (event.rawDate.includes('Dec') && currentMonth === 0) year = currentYear - 1;
        else if (event.rawDate.includes('Jan') && currentMonth === 11) year = currentYear + 1;

        // 🔥 时间解析修复：手动拼接 +0800 确保解析为 KL 时间
        // 将 "9:30pm" 转换为 "9:30 pm"
        let timeStr = event.rawTime.replace(/(\d)(am|pm)/i, '$1 $2');
        // 拼接成标准格式: "Jan 21 2026 9:30 pm +0800"
        let dateStr = `${event.rawDate} ${year} ${timeStr} +0800`;
        
        const dateObj = new Date(dateStr);

        if (!isNaN(dateObj.getTime())) {
           // 使用 title + date 作为唯一键更新，防止重复
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