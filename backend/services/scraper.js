const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const mongoose = require('mongoose');
const NewsEvent = require('../models/NewsEvent');

puppeteer.use(StealthPlugin());

const scrapeForexFactory = async () => {
  console.log('🕷️ 启动 V5.8 反拦截突破版 (伪造UA + 智能等待 + 隐藏自动化特征)...');

  // 1. 数据库连接
  if (mongoose.connection.readyState === 0) {
      console.log('⚠️ 建立临时数据库连接...');
      await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/forex_data');
  }

  let browser;
  try {
    // 🔥 1. 启动配置升级：隐藏自动化特征（增强版反Cloudflare）
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled', // 关键：禁用自动化控制特征
        '--window-size=1920,1080', // 伪装成正常屏幕大小
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--lang=en-US,en', // 设置语言
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    });

    // 只爬取本周新闻
    const week = 'this';

    console.log(`\n=============================`);
    console.log(`📅 正在扫描本周新闻: week=${week}`);
      
      const page = await browser.newPage();
      
      try {
          // 🔥 2. 增强反检测：伪造完整的浏览器指纹
          // 使用最新的 Chrome Windows User Agent
          await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
          
          // 移除 webdriver 属性
          await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
              get: () => undefined
            });
            
            // 伪造 plugins
            Object.defineProperty(navigator, 'plugins', {
              get: () => [1, 2, 3, 4, 5]
            });
            
            // 伪造 languages
            Object.defineProperty(navigator, 'languages', {
              get: () => ['en-US', 'en']
            });
            
            // 伪造 permissions
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
              parameters.name === 'notifications' ?
                Promise.resolve({ state: Notification.permission }) :
                originalQuery(parameters)
            );
            
            // 伪造 Chrome 对象
            window.chrome = {
              runtime: {}
            };
          });
          
          // 设置视口
          await page.setViewport({
            width: 1920,
            height: 1080,
            deviceScaleFactor: 1
          });
          
          // 设置额外的 headers
          await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Cache-Control': 'max-age=0'
          });

          // 开启日志
          page.on('console', msg => {
              if (msg.text().startsWith('DEBUG:')) console.log(msg.text());
          });

          // 注入 Cookie - 筛选器配置（每周自动重复使用）
          // impacts: ["3"] = 只显示高影响事件（红色）
          // events: 所有事件类型都选中（1-11）
          // currencies: 需要在页面上设置，但通过cookie可以保存筛选状态
          const filterConfig = encodeURIComponent(JSON.stringify({
            impacts: ["3"],  // 高影响
            events: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"],  // 所有事件类型
            currencies: ["USD"]  // 只显示USD相关事件
          }));
          
          // 设置cookie，有效期1年，确保每周自动爬取时都能使用
          await page.setCookie({
            name: 'ff_calendar_filters', 
            value: filterConfig, 
            domain: '.forexfactory.com', 
            path: '/', 
            expires: Math.floor(Date.now() / 1000) + 31536000  // 1年后过期，确保长期可用
          });
          
          console.log('✅ Filter配置已设置（高影响 + 所有事件类型 + USD）');

          // 跳转页面（只爬取本周）
          console.log('🚀 正在跳转到本周日历...');
          await page.goto(`https://www.forexfactory.com/calendar?week=${week}`, {
            waitUntil: 'networkidle2', // 等待网络空闲
            timeout: 90000
          });
          
          // 等待初始加载
          await new Promise(r => setTimeout(r, 3000));

          // 🔥 3. 智能等待：突破 Cloudflare 验证页面
          // 检查是否遇到 Cloudflare challenge
          let retryCount = 0;
          const maxRetries = 10;
          let tableLoaded = false;
          
          while (retryCount < maxRetries && !tableLoaded) {
            try {
              // 检查页面标题，如果还是 "Just a moment..." 说明还在验证
              const pageTitle = await page.title();
              console.log(`⏳ [尝试 ${retryCount + 1}/${maxRetries}] 页面标题: ${pageTitle}`);
              
              if (pageTitle.includes('Just a moment') || pageTitle.includes('Checking')) {
                console.log('🔄 Cloudflare 验证中，等待中...');
                await new Promise(r => setTimeout(r, 5000)); // 等待5秒
                
                // 模拟人类行为：随机移动鼠标和滚动
                await page.mouse.move(Math.random() * 500, Math.random() * 500);
                await page.evaluate(() => {
                  window.scrollBy(0, Math.random() * 300);
                });
                await new Promise(r => setTimeout(r, 1000));
                
                retryCount++;
                continue;
              }
              
              // 尝试等待表格出现
              await page.waitForSelector('table.calendar__table', { timeout: 10000 });
              console.log('✅ 成功突破拦截，表格已加载！');
              tableLoaded = true;
              break;
              
            } catch (e) {
              console.log(`⚠️ [尝试 ${retryCount + 1}] 表格未找到，继续等待...`);
              retryCount++;
              
              if (retryCount < maxRetries) {
                // 模拟人类行为
                await page.mouse.move(Math.random() * 500, Math.random() * 500);
                await page.evaluate(() => {
                  window.scrollBy(0, Math.random() * 200);
                });
                await new Promise(r => setTimeout(r, 3000));
              }
            }
          }
          
          if (!tableLoaded) {
            throw new Error('❌ 无法突破 Cloudflare 验证，表格未能加载');
          }

          // 模拟人类滚动行为
          console.log('🖱️ 正在模拟人类滚动行为...');
          await page.evaluate(async () => {
              await new Promise((resolve) => {
                  let totalHeight = 0;
                  const distance = 50 + Math.random() * 50; // 随机滚动距离
                  const timer = setInterval(() => {
                      const scrollHeight = document.body.scrollHeight;
                      window.scrollBy(0, distance);
                      totalHeight += distance;
                      
                      // 随机暂停，模拟人类行为
                      if (Math.random() > 0.9) {
                          clearInterval(timer);
                          setTimeout(() => {
                              const newTimer = setInterval(() => {
                                  window.scrollBy(0, distance);
                                  totalHeight += distance;
                                  if(totalHeight >= scrollHeight - window.innerHeight){
                                      clearInterval(newTimer);
                                      resolve();
                                  }
                              }, 50 + Math.random() * 100);
                          }, 500 + Math.random() * 1000);
                      }
                      
                      if(totalHeight >= scrollHeight - window.innerHeight){
                          clearInterval(timer);
                          resolve();
                      }
                  }, 100 + Math.random() * 100); // 随机滚动速度
              });
          });
          
          // 额外等待，确保所有数据都加载完成
          await new Promise(r => setTimeout(r, 3000));

          // 抓取逻辑
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

              const isTargetCurrency = (rawCurrency === 'USD' || rawCurrency === 'All');
              const isStacked = (rawCurrency === '');

              if (isRed) {
                  if (isTargetCurrency || isStacked) {
                      data.push({
                          title, 
                          currency: rawCurrency || 'USD', 
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

          console.log(`📊 本周抓取到: ${rawEvents.length} 条有效数据`);

          let savedCount = 0;
          for (const event of rawEvents) {
            // 跳过没有时间的事件（全天事件除外）
            if (!event.rawTime || (!event.rawTime.toLowerCase().includes('day') && !event.rawTime.match(/\d/))) {
              continue;
            } 

            const currentYear = new Date().getFullYear();
            const currentMonth = new Date().getMonth();
            let year = currentYear;
            
            if (event.rawDate.includes('Dec') && currentMonth === 0) year = currentYear - 1;
            else if (event.rawDate.includes('Jan') && currentMonth === 11) year = currentYear + 1;

            let timeStr = "";
            
            if (event.rawTime.toLowerCase().includes('day')) {
                 timeStr = "12:00 am";
                 console.log(`ℹ️ 全天事件: ${event.title}`);
            } else {
                 timeStr = event.rawTime.replace(/(\d)(am|pm)/i, '$1 $2');
            }
            
            // ForexFactory 显示的是 EST/EDT 时间（美国东部时间）
            // EST = UTC-5 (冬季), EDT = UTC-4 (夏令时，3月-11月)
            // 马来西亚时间 = UTC+8
            // 转换：EST -> Malaysia = +13小时, EDT -> Malaysia = +12小时
            
            // 解析日期和时间
            const dateStr = `${event.rawDate} ${year} ${timeStr}`;
            
            // 将时间转换为24小时制
            const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
            if (!timeMatch) {
                console.warn(`⚠️ 无法解析时间: ${timeStr}`);
                continue;
            }
            
            let hour = parseInt(timeMatch[1]);
            const minute = timeMatch[2];
            const period = timeMatch[3].toLowerCase();
            
            if (period === 'pm' && hour !== 12) hour += 12;
            if (period === 'am' && hour === 12) hour = 0;
            
            // 解析月份名称
            const monthMap = {
                'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
                'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
                'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
            };
            
            const dateMatch = event.rawDate.match(/(\w{3})\s+(\d{1,2})/);
            if (!dateMatch) {
                console.warn(`⚠️ 无法解析日期: ${event.rawDate}`);
                continue;
            }
            
            const month = monthMap[dateMatch[1]];
            const day = dateMatch[2].padStart(2, '0');
            const monthNum = parseInt(month) - 1;
            
            // 判断是否是夏令时（EDT）：3月第二个周日到11月第一个周日
            // 简化：3-10月使用EDT，其他月份使用EST
            const isDST = (monthNum >= 2 && monthNum <= 9); // 3月(2)到10月(9)
            
            // 创建 EST/EDT 时间的 ISO 字符串
            const tzOffset = isDST ? '-04:00' : '-05:00'; // EDT = -04:00, EST = -05:00
            const estISOStr = `${year}-${month}-${day}T${hour.toString().padStart(2, '0')}:${minute}:00${tzOffset}`;
            const estDate = new Date(estISOStr);
            
            if (isNaN(estDate.getTime())) {
                console.warn(`⚠️ 无效的日期: ${estISOStr}`);
                continue;
            }
            
            // 转换为马来西亚时间 (UTC+8)
            // 方法：将 EST/EDT 时间转换为 UTC，然后加上8小时得到马来西亚时间
            const utcTime = estDate.getTime(); // 获取UTC时间戳（毫秒）
            const malaysiaOffsetMs = 8 * 60 * 60 * 1000; // 8小时的毫秒数
            const malaysiaTime = new Date(utcTime + malaysiaOffsetMs);
            
            const dateObj = malaysiaTime;
            
            // 验证转换结果
            if (isNaN(dateObj.getTime())) {
                console.warn(`⚠️ 时区转换失败: ${event.title}`);
                continue;
            }

            // 保存到数据库（已转换为马来西亚时间）
            await NewsEvent.findOneAndUpdate(
              { title: event.title, date: dateObj },
              { ...event, date: dateObj },
              { upsert: true, new: true, setDefaultsOnInsert: true }
            );
            
            // 输出转换信息（用于调试）
            const malaysiaTimeStr = dateObj.toLocaleString('en-US', { 
              timeZone: 'Asia/Kuala_Lumpur',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            });
            console.log(`✅ ${event.title}: EST/EDT ${timeStr} -> Malaysia ${malaysiaTimeStr}`);
            
            savedCount++;
          }
          console.log(`💾 本周数据入库成功: ${savedCount} 条`);

      } catch (err) {
          console.error(`❌ 扫描本周新闻出错:`, err);
      } finally {
          await page.close(); 
      }

  } catch (error) {
    console.error('❌ 全局错误:', error);
  } finally {
    if (browser) await browser.close();
    console.log('👋 任务结束');
  }
};

module.exports = scrapeForexFactory;