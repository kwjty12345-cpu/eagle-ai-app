// backend/models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  // 这个 UID 是 Firebase 生成的唯一 ID，我们用它来认人
  firebaseUid: {
    type: String,
    required: true,
    unique: true,
    index: true // 加索引，查询更快
  },
  
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
  },
  
  // ❌ 删除 password 字段，我们不再存密码了！

  // --- SaaS 字段保持不变 ---
  stripeCustomerId: { type: String, default: null },
  subscriptionStatus: { type: String, default: 'free' },
  subscriptionPlan: { type: String, default: 'free' },
  subscriptionEndDate: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);