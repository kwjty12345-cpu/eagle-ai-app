const mongoose = require('mongoose');

const newsEventSchema = mongoose.Schema({
  title: { type: String, required: true }, // 新闻标题 (e.g., Unemployment Claims)
  country: { type: String, required: true }, // 货币/国家 (e.g., USD)
  date: { type: Date, required: true }, // 具体的发布时间 (马来西亚时间存储为 UTC)
  impact: { 
    type: String, 
    enum: ['High', 'Medium', 'Low'], 
    required: true 
  }, // 对应红/橙/黄文件夹
  forecast: { type: String, default: '' }, // 预测值
  previous: { type: String, default: '' }, // 前值
  actual: { type: String, default: '' }, // 公布值 (实时更新用)
  
  // --- 以下字段为后续 AI 功能预留，目前先定义好以免修改 Schema ---
  aiPrediction: {
    direction: { type: String, enum: ['BUY', 'SELL', 'WAIT'], default: 'WAIT' }, // 只有 Buy/Sell, Wait 是默认
    confidence: { type: String, default: '0%' }, // 信心指数
    reasoning: { type: String, default: '' }, // AI 的分析理由
    isLocked: { type: Boolean, default: true } // 是否需要付费解锁
  },
  isAnalyzed: { type: Boolean, default: false } // 是否已经由 AI 分析过
}, {
  timestamps: true // 自动记录创建和更新时间
});

// 防止重复插入：根据 标题+日期 建立唯一索引
newsEventSchema.index({ title: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('NewsEvent', newsEventSchema);