// controllers/userController.js
// 注意：我们不再需要 jsonwebtoken 和 bcryptjs 了，因为 Firebase 和中间件帮我们搞定了

// @desc    同步用户数据 / 获取个人信息
// @route   POST /api/users/sync
// @access  Private (需要 Firebase Token)
const getMe = async (req, res) => {
  // 逻辑非常简单：
  // 1. 请求经过 authMiddleware 时，中间件已经验证了 Firebase Token。
  // 2. 中间件还顺便去 MongoDB 查了用户（如果没有就自动创建了）。
  // 3. 中间件把找到的用户挂载到了 req.user 上。
  
  // 所以我们只需要把它返回给前端：
  if (req.user) {
    res.status(200).json(req.user);
  } else {
    res.status(404).json({ message: '未找到用户信息' });
  }
};

module.exports = { getMe };