// config/db.js
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // 读取 .env 里的连接地址
    const conn = await mongoose.connect(process.env.MONGO_URI);

    console.log(`MongoDB 连接成功: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1); // 连不上就退出程序
  }
};

module.exports = connectDB;