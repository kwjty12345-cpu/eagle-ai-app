const mongoose = require('mongoose');

const NewsEventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  currency: String,
  impact: String,
  date: { type: Date, required: true },
  forecast: String,
  actual: String,
  previous: String,
  
  // 👇 优化后的 AI 字段
  ai_prediction: {
    // 1. 加个开关，查询 "未分析新闻" 时更方便: find({ 'ai_prediction.isAnalyzed': false })
    isAnalyzed: { type: Boolean, default: false },

    // 2. 加 Enum 限制，保证数据纯净
    direction: { 
      type: String, 
      enum: ['BUY', 'SELL', 'NEUTRAL', null], // 只允许这几个值
      default: null 
    }, 
    
    confidence: { type: Number, default: null }, 
    
    confidenceLevel: { 
      type: String, 
      enum: ['HIGH', 'MED', 'LOW', null], // 同样加限制
      default: null 
    }, 
    
    reason: { type: String, default: null }, 
    
    // 3. 去掉 default，只在真正分析时写入时间
    predictedAt: { type: Date } 
  }
});

// 创建索引：经常要查“某个时间段内”且“已分析”的新闻，加索引查询飞快
NewsEventSchema.index({ date: 1, 'ai_prediction.isAnalyzed': 1 });

module.exports = mongoose.model('NewsEvent', NewsEventSchema);