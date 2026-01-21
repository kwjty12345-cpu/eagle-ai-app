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
    direction: { type: String, default: null },   // 例如: "BUY" / "SELL" / "NEUTRAL"
    confidence: { type: Number, default: null },  // 例如: 60-99 (数字)
    confidenceLevel: { type: String, default: null }, // 例如: "HIGH" / "MED" / "LOW"
    reason: { type: String, default: null }, // AI 分析原因
    predictedAt: { type: Date, default: Date.now } // 记录预测时间
  }
});

// 确保你导出的是这个修改后的模型
module.exports = mongoose.model('NewsEvent', NewsEventSchema);