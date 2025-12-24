const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
// 👇 1. 引入 node-cron
const cron = require('node-cron'); 
require('dotenv').config();

// 引入服务
const scrapeForexFactory = require('./services/scraper');
const NewsEvent = require('./models/NewsEvent');
const { getPrediction } = require('./services/aiService'); 

const app = express();
app.use(cors());
app.use(express.json());

// 连接数据库
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB Connected');
    
    // 启动时立即执行一次 (防止刚启动没数据)
    try {
        console.log('🚀 服务器启动，正在执行首次数据同步...');
        scrapeForexFactory(); 
    } catch (e) {
        console.error("Scraper Init Error:", e);
    }
  })
  .catch(err => console.log('MongoDB Error:', err));

// 👇 2. 添加定时任务配置
// 语法: '0 1 * * 1' 代表每周一凌晨 01:00 自动执行
cron.schedule('0 1 * * 1', () => {
  console.log('⏰ 定时任务触发：开始抓取本周新新闻...');
  scrapeForexFactory();
});

// (可选) 周二早上再补抓一次，防止周一数据源还没更新完全
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

// API: AI 预测 (黄金版)
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

    // 确保是数组
    if (!Array.isArray(events)) {
        events = [events];
    }
    
    // 调用 AI 服务
    const prediction = await getPrediction(events);
    
    res.json(prediction);
  } catch (err) {
    console.error("Prediction API Error:", err);
    res.status(500).json({ error: 'Server Error' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));