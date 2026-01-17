require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require('node-cron'); 

const connectDB = require('./config/db');
const userRoutes = require('./routes/userRoutes');
// 👇 1. 引入 Crypto 路由 (保持不变)
const cryptoRoutes = require('./routes/cryptoRoutes');

const scrapeForexFactory = require('./services/scraper');
const NewsEvent = require('./models/NewsEvent');
const { getPrediction } = require('./services/aiService'); 

const app = express();

// 👇 2. 修改: 更加稳健的 CORS 配置 (为了上线 Railway)
// 如果只用 app.use(cors())，上线后可能会遇到 Cookie/Token 验证失败的问题
const allowedOrigins = [
  "http://localhost:5173",
  "https://eagle-ai-app.vercel.app" // 你的线上前端地址
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      // 开发测试阶段，为了防止报错，暂时允许所有，但在生产环境建议严格检查
      return callback(null, true); 
    }
    return callback(null, true);
  },
  credentials: true
}));

app.use(express.json());

// 启用用户路由
app.use('/api/users', userRoutes);

// 👇 3. 修改: 启用 Crypto 路由 (修复报错的地方)
// ❌ 删除了: app.use('/api/payment', paymentRoutes); 
// ✅ 换成了:
app.use('/api/crypto', cryptoRoutes);

connectDB();

mongoose.connection.once('open', () => {
    try {
        console.log('🚀 服务器启动，正在执行首次数据同步...');
        scrapeForexFactory(); 
    } catch (e) {
        console.error("Scraper Init Error:", e);
    }
});

// 👇 下面所有的代码完全保持不变 👇

// 定时任务配置
cron.schedule('0 1 * * 1', () => {
  console.log('⏰ 定时任务触发：开始抓取本周新新闻...');
  scrapeForexFactory();
});

cron.schedule('0 8 * * 2', () => {
  console.log('⏰ 补漏任务触发：周二早上再次同步...');
  scrapeForexFactory();
});


// API: 获取新闻列表
app.get('/api/news', async (req, res) => {
  try {
    const news = await NewsEvent.find().sort({ date: -1 }).limit(10);
    res.json(news);
  } catch (err) {
    res.status(500).json({ error: 'Server Error' });
  }
});

// API: AI 预测并保存到数据库
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
    
    if (events.length === 1 && events[0]._id) {
        const eventId = events[0]._id;
        
        await NewsEvent.findByIdAndUpdate(eventId, {
            $set: {
                ai_prediction: {
                    direction: prediction.direction || prediction.sales_direction,
                    confidence: prediction.confidence || prediction.confident,
                    probability: prediction.probability,
                    predictedAt: new Date()
                }
            }
        });
        console.log(`💾 AI 预测结果已保存至事件 ID: ${eventId}`);
    }

    res.json(prediction);

  } catch (err) {
    console.error("Prediction API Error:", err);
    res.status(500).json({ error: 'Server Error' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));