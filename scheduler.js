// 文件名: scheduler.js
const cron = require('node-cron');
// 👇 注意：这里要指向你刚才那个爬虫文件的正确路径
// 如果你的爬虫文件在 services/scraper.js，就要写 './services/scraper'
// 需要加上 backend 这一层
const scrapeForexFactory = require('./backend/services/scraper');

console.log('🕒 定时任务服务已启动 (Forex Scheduler Started)...');

// ==========================================
// 设定定时规则：每周一上午 8:00 (自动跑一次)
// ==========================================
// 格式: 分 时 日 月 周
cron.schedule('0 8 * * 1', async () => {
    console.log('⏰ 触发周一自动抓取任务...');
    try {
        await scrapeForexFactory();
        console.log('✅ 定时任务执行完毕');
    } catch (err) {
        console.error('❌ 定时任务执行出错:', err);
    }
});

// 👇 为了测试，我们在启动时立即跑一次（你可以随时把这行注释掉）
console.log('🚀 为了测试，立即执行一次抓取...');
scrapeForexFactory();