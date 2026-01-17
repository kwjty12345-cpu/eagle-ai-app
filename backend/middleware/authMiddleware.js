const { auth } = require('../config/firebase');

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    // 1. 检查有没有 Header
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log("❌ [Auth] 缺少 Authorization Header");
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    
    // 2. 打印 Token 前几位，确认收到了东西 (不要打印全部，不安全)
    console.log(`🔍 [Auth] 收到 Token: ${token.substring(0, 10)}...`);
    
    // 3. 尝试验证
    const decodedToken = await auth.verifyIdToken(token);
    
    console.log("✅ [Auth] Token 验证成功! UID:", decodedToken.uid);
    req.user = decodedToken;
    next();
    
  } catch (error) {
    // 🔥🔥🔥 关键：打印详细的 Firebase 错误信息 🔥🔥🔥
    console.error("❌ [Auth] 验证失败详情:", JSON.stringify(error, null, 2));
    console.error("❌ [Auth] 错误代码 (Code):", error.code);
    console.error("❌ [Auth] 错误信息 (Message):", error.message);

    // 根据具体错误返回不同提示
    if (error.code === 'auth/argument-error') {
       return res.status(401).json({ error: 'Token 格式错误 (Argument Error)' });
    }
    if (error.code === 'auth/id-token-expired') {
       return res.status(401).json({ error: 'Token 已过期 (Expired)' });
    }
    if (error.code === 'auth/invalid-credential') {
        // 这是最常见的情况：密钥不对
       return res.status(401).json({ error: '服务端密钥配置错误 (Invalid Credential)' });
    }

    res.status(401).json({ error: 'Authentication failed', details: error.message });
  }
};

module.exports = authMiddleware;