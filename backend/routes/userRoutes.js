// routes/userRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { getMe } = require('../controllers/userController');

// 现在的流程是：前端登录 Firebase -> 拿到 Token -> 调用这个接口同步资料
// 我们把路径统一改为 /sync (或者你保留 /me 也可以，看你习惯)
router.post('/sync', protect, getMe);

module.exports = router;