// frontend/src/components/Login.jsx
import React, { useState } from 'react';
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../firebase"; // 引入刚才配置好的 firebase

const Login = () => {
  const [user, setUser] = useState(null);

  const handleGoogleLogin = async () => {
    try {
      // 1. 弹出 Google 登录窗口
      const result = await signInWithPopup(auth, googleProvider);
      const firebaseUser = result.user;
      
      console.log("🔥 Firebase 登录成功:", firebaseUser.email);

      // 2. 获取 ID Token (这就是我们要发给后端的“通行证”)
      const token = await firebaseUser.getIdToken();
      console.log("🎫 获取 Token 成功:", token.substring(0, 20) + "...");

      // 3. 把 Token 发给后端验证 (Sync)
      const response = await fetch("http://localhost:5000/api/users/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}` // 关键：把 Token 放在这里
        }
      });

      const data = await response.json();
      
      if (response.ok) {
        console.log("✅ 后端验证成功! 用户数据:", data);
        setUser(data); // 把后端返回的用户数据存起来显示
        alert(`欢迎回来, ${data.email}!`);
      } else {
        console.error("❌ 后端验证失败:", data);
      }

    } catch (error) {
      console.error("登录出错:", error);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white">
      <h1 className="text-4xl font-bold mb-8 text-eagle-gold">EAGLE.AI</h1>
      
      {user ? (
        <div className="text-center">
          <p className="text-xl mb-4">登录成功！</p>
          <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
            <p>ID: {user._id}</p>
            <p>Email: {user.email}</p>
            <p className="text-green-400">会员状态: {user.subscriptionStatus}</p>
          </div>
        </div>
      ) : (
        <button
          onClick={handleGoogleLogin}
          className="bg-white text-gray-900 px-6 py-3 rounded-full font-bold hover:bg-gray-200 transition duration-300 flex items-center gap-2"
        >
          {/* 这里放一个简单的 Google 图标 SVG */}
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.26.81-.58z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          使用 Google 登录
        </button>
      )}
    </div>
  );
};

export default Login;