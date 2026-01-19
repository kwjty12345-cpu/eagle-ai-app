// backend/middleware/authMiddleware.js
const { auth } = require('../config/firebase'); // 👈 注意：确保这里路径对，是导出 admin.auth() 的那个文件
const User = require('../models/User');   // 👈 必须引入 User 模型

const protect = async (req, res, next) => {
  let token;

  try {
    const authHeader = req.headers.authorization;

    // 1. 检查 Header
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log("❌ [Auth] 缺少 Authorization Header");
      return res.status(401).json({ error: 'No token provided' });
    }

    token = authHeader.split(' ')[1];

    // 2. 验证 Token (Firebase 侧)
    // console.log(`🔍 [Auth] 收到 Token: ${token.substring(0, 10)}...`); 
    const decodedToken = await auth.verifyIdToken(token);
    
    // 3. 🔥关键修复：去 MongoDB 查找对应的用户
    // 假设你的 User 模型里存了 firebaseUid，或者用 email 查找
    // 这里的逻辑通常是：User.findOne({ firebaseUid: decodedToken.uid }) 
    // 或者如果你的逻辑是用 email 关联：
    const user = await User.findOne({ email: decodedToken.email });

    if (!user) {
      console.error("❌ [Auth] Token 有效，但在数据库没找到该用户:", decodedToken.email);
      return res.status(404).json({ error: 'User not found in database' });
    }

    // 4. ✅ 验证成功，把 数据库User对象 (包含 _id) 赋给 req.user
    console.log(`✅ [Auth] 验证通过! 用户: ${user.email} (ID: ${user._id})`);
    req.user = user; 
    next();

  } catch (error) {
    // 5. 详细错误日志 (保留你写的优秀日志逻辑)
    console.error("❌ [Auth] 验证失败详情:", JSON.stringify(error, null, 2));
    
    if (error.code === 'auth/argument-error') {
       return res.status(401).json({ error: 'Token 格式错误 (Argument Error)' });
    }
    if (error.code === 'auth/id-token-expired') {
       return res.status(401).json({ error: 'Token 已过期 (Expired) - 请重新登录' });
    }
    if (error.code === 'auth/invalid-credential') {
       //这是最可能的情况：Railway 的环境变量私钥配置错了
       console.error("🔥🔥🔥 极高概率：Railway 环境变量 FIREBASE_PRIVATE_KEY 格式不对！");
       return res.status(401).json({ error: '服务端配置错误 (Server Credential Error)' });
    }

    res.status(401).json({ error: 'Authentication failed', details: error.message });
  }
};

module.exports = { protect };