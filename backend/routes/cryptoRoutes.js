// backend/routes/cryptoRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware'); // 保护路由
const { createCryptoPayment, handleWebhook } = require('../controllers/cryptoController');

// 1. 创建订单 (只有登录用户能调)
router.post('/create', protect, createCryptoPayment);

// 2. Webhook 回调 (公开，NowPayments 服务器会调这个)
router.post('/webhook', handleWebhook);

module.exports = router;