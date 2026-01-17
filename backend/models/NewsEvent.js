const mongoose = require('mongoose');

const NewsEventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  currency: String,
  impact: String,
  date: { type: Date, required: true },
  forecast: String,
  actual: String,
  previous: String,
  
  // 👇 新增：用来存 AI 预测结果
  ai_prediction: {
    direction: { type: String, default: null },   // 例如: "Bullish" / "Bearish"
    confidence: { type: String, default: null },  // 例如: "High" / "Medium"
    probability: { type: String, default: null }, // 例如: "85%"
    predictedAt: { type: Date, default: Date.now } // 记录预测时间
  }
});

// 确保你导出的是这个修改后的模型
module.exports = mongoose.model('NewsEvent', NewsEventSchema);