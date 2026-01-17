// backend/middleware/authMiddleware.js
const admin = require('../config/firebase'); // 引入我们刚才初始化的 firebase
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;

  // 1. 获取 Token
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: '未授权，没有 Token' });
  }

  try {
    // 2. 🔥 让 Firebase 验证 Token 真伪
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // decodedToken.uid 就是这个用户在 Firebase 里的唯一 ID
    const firebaseUid = decodedToken.uid;
    const email = decodedToken.email;

    // 3. 去 MongoDB 找这个用户
    // 逻辑：如果 MongoDB 里没有这个用户（比如他刚在前端用 Google 登录），
    // 我们就在这里自动帮他在 MongoDB 建个档。这叫 "Sync" (同步)。
    
    let user = await User.findOne({ firebaseUid });

    if (!user) {
        // 如果是新用户，自动创建
        user = await User.create({
            firebaseUid,
            email
        });
    }

    // 4. 把用户信息挂载到 req 上
    req.user = user;
    next();

  } catch (error) {
    console.error('Firebase Auth Error:', error);
    res.status(401).json({ message: 'Token 无效或已过期' });
  }
};

module.exports = { protect };