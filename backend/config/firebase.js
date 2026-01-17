const admin = require("firebase-admin");
require('dotenv').config();

let serviceAccount;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    // 🟢 情况 A: 线上环境 (Railway)
    // 我们会把 JSON 的内容直接塞进这个变量里
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else {
    // 🟡 情况 B: 本地开发
    // 尝试读取本地文件
    serviceAccount = require("./serviceAccountKey.json");
  }
} catch (error) {
  console.error("❌ Firebase 初始化失败: 找不到密钥配置 (File or Env Variable missing)");
  console.error(error);
  process.exit(1); // 强制退出，避免后续报错
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const auth = admin.auth();
module.exports = { auth };