// backend/middleware/authMiddleware.js
const { auth } = require('../config/firebase'); 
const User = require('../models/User'); 

const protect = async (req, res, next) => {
  let token;

  try {
    const authHeader = req.headers.authorization;

    // 1. 检查 Header (保持不变)
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log("❌ [Auth] 缺少 Authorization Header");
      return res.status(401).json({ error: 'No token provided' });
    }

    token = authHeader.split(' ')[1];

    // 2. 验证 Token (保持不变)
    const decodedToken = await auth.verifyIdToken(token);
    
    // ============================================================
    // 3. 🔥🔥 核心修改：查找用户，如果没有则自动创建 (Auto-Register)
    // ============================================================
    
    // 注意：这里改成 let，因为下面可能需要给 user 重新赋值
    // 建议：如果你 User 模型里 index 是 firebaseUid，这里最好用 { firebaseUid: decodedToken.uid } 查
    let user = await User.findOne({ email: decodedToken.email });

    if (!user) {
      console.log(`🆕 [Auth] 数据库未找到用户 ${decodedToken.email}，正在自动注册...`);
      
      // 自动创建新用户
      user = await User.create({
        firebaseUid: decodedToken.uid, // 👈 必填！User模型里要求了这个字段
        email: decodedToken.email,
        // 其他字段会有默认值 (如 'free' plan)
      });
      
      console.log(`✅ [Auth] 新用户创建成功! ID: ${user._id}`);
    }

    // ============================================================
    // 下面的代码保持不动
    // ============================================================

    // 4. ✅ 验证成功，把 数据库User对象 (包含 _id) 赋给 req.user
    // console.log(`✅ [Auth] 验证通过! 用户: ${user.email} (ID: ${user._id})`);
    req.user = user; 
    next();

  } catch (error) {
    // 5. 详细错误日志 (保持不变)
    console.error("❌ [Auth] 验证失败详情:", JSON.stringify(error, null, 2));
    
    if (error.code === 'auth/argument-error') {
       return res.status(401).json({ error: 'Token 格式错误 (Argument Error)' });
    }
    if (error.code === 'auth/id-token-expired') {
       return res.status(401).json({ error: 'Token 已过期 (Expired) - 请重新登录' });
    }
    if (error.code === 'auth/invalid-credential') {
       console.error("🔥🔥🔥 极高概率：Railway 环境变量 FIREBASE_PRIVATE_KEY 格式不对！");
       return res.status(401).json({ error: '服务端配置错误 (Server Credential Error)' });
    }

    res.status(401).json({ error: 'Authentication failed', details: error.message });
  }
};

module.exports = { protect };