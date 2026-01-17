const admin = require("firebase-admin");
require('dotenv').config();

// 初始化逻辑
const initializeFirebase = () => {
  // 1. 如果已经初始化过，直接返回
  if (admin.apps.length) {
    return admin.app();
  }

  let credential;

  // 2. 优先检查：是否在 Railway 线上环境 (使用拆分变量)
  if (process.env.FIREBASE_PRIVATE_KEY) {
    console.log("🔥 正在使用 Railway 环境变量模式...");
    
    // 关键修复：处理私钥的换行符
    // 有时候环境变量里的 \n 是真的换行，有时候是字符串 "\n"，这里统一修好
    const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

    credential = admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey,
    });
  
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    // 3. 备用方案：如果还在用 JSON 字符串 (兼容旧配置)
    console.log("🔥 正在使用 JSON 字符串模式...");
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    // 修复私钥
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    credential = admin.credential.cert(serviceAccount);

  } else {
    // 4. 本地开发环境 (读取文件)
    console.log("💻 正在使用本地文件模式...");
    try {
      const serviceAccount = require("./serviceAccountKey.json");
      credential = admin.credential.cert(serviceAccount);
    } catch (e) {
      console.error("❌ 致命错误: 找不到任何 Firebase 配置 (Variables or File missing)");
    }
  }

  // 执行初始化
  try {
    admin.initializeApp({ credential });
    console.log("✅ Firebase Admin 初始化成功!");
  } catch (error) {
    console.error("❌ Firebase 初始化失败:", error);
  }

  return admin.app();
};

const app = initializeFirebase();
const auth = admin.auth();

module.exports = { auth };