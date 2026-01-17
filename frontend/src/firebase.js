// frontend/src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

// 👇 把你在 Firebase 控制台复制的那段 firebaseConfig 替换下面这一块
const firebaseConfig = {
  apiKey: "AIzaSyCV7A_DNtJJUyrDo74HtPSLMSgYUHR1vZg",
  authDomain: "eagle-ai-e91cc.firebaseapp.com",
  projectId: "eagle-ai-e91cc",
  storageBucket: "eagle-ai-e91cc.firebasestorage.app",
  messagingSenderId: "653176891225",
  appId: "1:653176891225:web:089f4e95f0bde594354e48",
  measurementId: "G-D6NVZ1TWEM"
};

// 1. 初始化 Firebase
const app = initializeApp(firebaseConfig);

// 2. 导出认证工具 (Auth) 和 Google 登录提供器 (Provider)
// 以后我们在登录页面直接引用这两个变量就行了
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();