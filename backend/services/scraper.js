require('dotenv').config(); 
const mongoose = require('mongoose');
const NewsEvent = require('../models/NewsEvent');

const scrapeForexFactory = async () => {
  console.log('🚀 启动 V6.0 API极速版 Server 数据同步...');

  // 1. 数据库连接
  if (mongoose.connection.readyState === 0) {
      console.log('⚠️ 建立数据库连接...');
      const dbUri = process.env.MONGO_URI || 'mongodb://localhost:27017/forex_data';
      await mongoose.connect(dbUri);
  }

  try {
    console.log('🌐 正在请求 Forex Factory 官方数据接口...');

    // 使用原生的 fetch 请求 JSON 数据源
    const response = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json'
        },
        // 设置 10 秒超时
        signal: AbortSignal.timeout(10000) 
    });

    if (!response.ok) {
        throw new Error(`API 请求失败，状态码: ${response.status}`);
    }

    const rawEvents = await response.json();
    console.log(`📊 接口拉取成功，共 ${rawEvents.length} 条原始数据。开始清洗过滤...`);

    let savedCount = 0;

    // 2. 数据清洗与入库
    for (const event of rawEvents) {
        // 我们只保留 国家为 USD 且 危险等级为 High 的数据
        if (event.country === 'USD' && event.impact === 'High') {
            
            // API 的日期自带标准时区 (例如: "2026-02-18T19:00:00-05:00")，直接转为 Date 对象
            const dateObj = new Date(event.date);

            if (!isNaN(dateObj.getTime())) {
                await NewsEvent.findOneAndUpdate(
                    { title: event.title, date: dateObj }, // 用标题和精确时间作为唯一凭证查找
                    { 
                        title: event.title,
                        currency: 'USD',
                        impact: 'High',
                        date: dateObj,
                        // API 返回空值时可能是 null，我们给个默认显示 '--'
                        forecast: event.forecast || '--',
                        actual: event.actual || '--',
                        previous: event.previous || '--'
                    }, 
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );
                savedCount++;
            }
        }
    }

    console.log(`💾 数据同步完美结束！成功更新入库 ${savedCount} 条 [美元-高危] 新闻。`);

  } catch (error) {
    console.error('❌ 数据同步发生错误:', error.message);
  } finally {
    console.log('👋 任务结束');
  }
};

module.exports = scrapeForexFactory;