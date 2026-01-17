// backend/config/firebase.js
const admin = require('firebase-admin');

// 引入刚才下载的钥匙文件
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

console.log('🔥 Firebase Admin 已连接');

module.exports = admin;