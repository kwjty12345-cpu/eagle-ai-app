require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require('node-cron'); 

const connectDB = require('./config/db');
const userRoutes = require('./routes/userRoutes');
const cryptoRoutes = require('./routes/cryptoRoutes'); // ✅ 确保这里引入了

const scrapeForexFactory = require('./services/scraper');
const NewsEvent = require('./models/NewsEvent');
const { getPrediction } = require('./services/aiService'); 

const app = express();

// --- CORS 配置 (允许线上前端访问) ---
const allowedOrigins = [
  "http://localhost:5173",
  "https://eagle-ai-app.vercel.app" // 你的线上前端域名
];

app.use(cors({
  origin: function (origin, callback) {
    // 允许没有 origin 的请求 (比如 Postman, 爬虫, 本地请求)
    if (!origin) return callback(null, true);
    
    // 检查 origin 是否在白名单里
    if (allowedOrigins.indexOf(origin) === -1) {
      // ⚠️ 生产环境宽容模式: 即使不在白名单也允许 (为了防止域名变动导致的误杀)
      // 如果你想严格限制，把下面这行改成: return callback(new Error('CORS not allowed'), false);
      return callback(null, true); 
    }
    return callback(null, true);
  },
  credentials: true
}));

app.use(express.json());

// --- 注册路由 ---
app.use('/api/users', userRoutes);
app.use('/api/crypto', cryptoRoutes); // ✅ 确保支付路由启用

// --- 连接数据库 ---
connectDB();

mongoose.connection.once('open', () => {
    try {
        console.log('🚀 服务器启动，正在执行首次数据同步...');
        // 这里的爬虫可以根据需要开启或关闭
        scrapeForexFactory(); 
    } catch (e) {
        console.error("Scraper Init Error:", e);
    }
});

// --- 定时任务：每周自动爬取本周新闻 ---
// 注意：cron 使用的是服务器本地时间（UTC），请根据部署环境调整
// 周一凌晨1点（UTC）= 马来西亚时间早上9点（UTC+8）
cron.schedule('0 1 * * 1', () => {
  console.log('⏰ [定时任务] 每周一自动抓取本周新闻...');
  scrapeForexFactory();
});

// 周二早上8点（UTC）= 马来西亚时间下午4点（UTC+8）补漏同步
cron.schedule('0 8 * * 2', () => {
  console.log('⏰ [补漏任务] 周二早上再次同步本周新闻...');
  scrapeForexFactory();
});

// --- API: 获取新闻列表 ---
app.get('/api/news', async (req, res) => {
  try {
    const news = await NewsEvent.find().sort({ date: -1 }).limit(10);
    res.json(news);
  } catch (err) {
    res.status(500).json({ error: 'Server Error' });
  }
});

// --- API: AI 预测 ---
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
        
        // 确保数据格式正确
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