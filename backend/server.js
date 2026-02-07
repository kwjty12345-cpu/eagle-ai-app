require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require('node-cron'); 

const connectDB = require('./config/db');
const userRoutes = require('./routes/userRoutes');
const cryptoRoutes = require('./routes/cryptoRoutes'); 

const scrapeForexFactory = require('./services/scraper');
const NewsEvent = require('./models/NewsEvent');
const { getPrediction } = require('./services/aiService'); 

const app = express();

// --- CORS 配置 ---
const allowedOrigins = [
  "http://localhost:5173",
  "https://eagle-ai-app.vercel.app" 
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      return callback(null, true); 
    }
    return callback(null, true);
  },
  credentials: true
}));

app.use(express.json());

// --- 注册路由 ---
app.use('/api/users', userRoutes);
app.use('/api/crypto', cryptoRoutes); 

// --- 连接数据库 ---
connectDB();

mongoose.connection.once('open', () => {
    try {
        console.log('🚀 服务器启动，正在执行首次数据同步...');
        scrapeForexFactory(); 
    } catch (e) {
        console.error("Scraper Init Error:", e);
    }
});

// --- 定时任务 1：每周自动爬取本周新闻 ---
cron.schedule('0 1 * * 1', () => {
  console.log('⏰ [定时任务] 每周一自动抓取本周新闻...');
  scrapeForexFactory();
});

// --- 定时任务 2：周二补漏同步 ---
cron.schedule('0 8 * * 2', () => {
  console.log('⏰ [补漏任务] 周二早上再次同步本周新闻...');
  scrapeForexFactory();
});

// 🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥
// 👇👇👇 新增代码：AI 自动分析监工 (每10分钟运行一次) 👇👇👇
// 🔥🔥🔥 AI 自动分析监工 (持续刷新版) 🔥🔥🔥
// 每 10 分钟运行一次
cron.schedule('*/10 * * * *', async () => {
    console.log('🤖 [AI 监工] 开始刷新未来新闻的预测...');

    try {
        // 1. 查找所有“未来”的新闻
        //    注意：这里去掉了 isAnalyzed 的限制，以便持续更新
        const futureEvents = await NewsEvent.find({
            date: { $gt: new Date() } // ✅ 只要还没发生，就一直在这个列表里
        })
        .sort({ date: 1 }) // 优先处理最近即将发生的新闻
        .limit(10);        // 每次刷新最近的 10 条 (避免消耗太多资源)

        if (futureEvents.length === 0) {
            console.log('✅ 没有未来的新闻需要监控。');
            return;
        }

        console.log(`🔄 正在刷新 ${futureEvents.length} 条新闻的分析...`);

        // 2. 逐条重新分析并覆盖数据库
        for (const event of futureEvents) {
            try {
                // 调用 AI 获取最新预测
                const prediction = await getPrediction([event]);

                // 3. 覆盖写入 (overwrite)
                await NewsEvent.findByIdAndUpdate(event._id, {
                    $set: {
                        ai_prediction: {
                            isAnalyzed: true, 
                            direction: prediction.direction,
                            confidence: prediction.confidence,
                            confidenceLevel: prediction.confidenceLevel,
                            reason: prediction.reason,
                            predictedAt: new Date() // ✅ 更新为最新的分析时间
                        }
                    }
                });
                console.log(`🔄 [已更新] ${event.title} -> ${prediction.direction} (Confidence: ${prediction.confidence}%)`);

            } catch (innerErr) {
                console.error(`❌ 刷新失败 (${event.title}):`, innerErr.message);
            }
        }
    } catch (err) {
        console.error('💥 AI Cron 任务出错:', err);
    }
});
// 👆👆👆 新增代码结束 👆👆👆
// 🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥

// --- API: 获取新闻列表 ---
app.get('/api/news', async (req, res) => {
  try {
    const news = await NewsEvent.find().sort({ date: -1 }).limit(10);
    res.json(news);
  } catch (err) {
    res.status(500).json({ error: 'Server Error' });
  }
});

// --- API: AI 预测 (手动触发/前端调用) ---
app.get('/api/predict', async (req, res) => {
  try {
    const eventData = req.query.data;
    
    if (!eventData) return res.status(400).json({ error: 'No data provided' });

    let events;
    try {
        events = JSON.parse(eventData);
    } catch (e) {
        return res.status(400).json({ error: 'Invalid JSON data' });
    }

    if (!Array.isArray(events)) {
        events = [events];
    }
    
    const prediction = await getPrediction(events);
    
    // 如果是单个事件，保存预测结果
    if (events.length === 1 && events[0]._id) {
        const eventId = events[0]._id;
        
        const predictionData = {
            direction: prediction.direction || 'NEUTRAL',
            confidence: typeof prediction.confidence === 'number' ? prediction.confidence : parseInt(prediction.confidence) || 0,
            confidenceLevel: prediction.confidenceLevel || 'LOW',
            reason: prediction.reason || 'No reason provided',
            predictedAt: new Date()
        };
        
        await NewsEvent.findByIdAndUpdate(eventId, {
            $set: {
                ai_prediction: predictionData
            }
        });
        console.log(`💾 AI 预测结果已保存至事件 ID: ${eventId}`, predictionData);
    }

    res.json(prediction);

  } catch (err) {
    console.error("Prediction API Error:", err);
    res.status(500).json({ error: 'Server Error' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));