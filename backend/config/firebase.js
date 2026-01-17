const admin = require("firebase-admin");
require('dotenv').config();

let serviceAccount;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    // 🟢 线上环境 (Railway)
    // 尝试解析 JSON
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

    // 🛠️ 关键修复：自动修复 Private Key 中的换行符问题
    // 有时候环境变量里的 \n 会变成字面量 "\\n"，导致 Key 无效，从而报 401
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
  } else {
    // 🟡 本地开发
    serviceAccount = require("./serviceAccountKey.json");
  }
} catch (error) {
  console.error("❌ Firebase 初始化失败: 找不到密钥配置");
  console.error(error);
  // 不强制退出，防止整个服务器因为这个挂掉，方便看日志
}

// 防止重复初始化
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const auth = admin.auth();
module.exports = { auth };