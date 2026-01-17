import React, { useState } from 'react';
import { auth } from '../firebase';

// 自动判断是本地开发还是线上环境
const API_BASE = import.meta.env.MODE === "development"
  ? "http://localhost:5000"
  : "https://eagle-ai-app-production.up.railway.app"; // 你的 Railway 真实地址

const PaymentModal = ({ onClose, onUpgrade }) => {
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async (planType) => {
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        alert("Please login first!");
        setLoading(false);
        return;
      }

      const token = await user.getIdToken();

      // 请求后端创建 USDT 订单
      const response = await fetch(`${API_BASE}/api/crypto/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ plan: planType })
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.message || "Order creation failed");

      // NowPayments 返回的是 invoice_url，直接跳转
      if (data.url) {
        window.location.href = data.url;
      }

    } catch (error) {
      console.error("Payment Error:", error);
      alert("Error: " + error.message);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl relative animate-fadeIn">
        
        {/* 关闭按钮 */}
        <button 
          onClick={onClose}
          className="absolute -top-12 right-0 text-gray-400 hover:text-white transition-colors"
        >
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* 标题区域 */}
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-black text-white mb-2 tracking-wide">
            Upgrade to Eagle VIP
          </h2>
          <p className="text-gray-400 text-sm md:text-base">
            Unlock AI-powered predictions with Crypto.
          </p>
        </div>

        {/* 三列布局 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* 1. Free Plan */}
          <div className="bg-[#0f1219] rounded-2xl p-6 border border-gray-800 flex flex-col h-full opacity-60">
            <h3 className="text-xl font-bold text-white mb-2">Free Plan</h3>
            <div className="text-4xl font-black text-white mb-6">
              $0 <span className="text-sm font-normal text-gray-500">/ month</span>
            </div>
            
            <ul className="space-y-4 mb-8 flex-1">
              <li className="flex items-start gap-3 text-sm text-gray-300">
                <span className="text-gray-500 mt-0.5">✓</span>
                View upcoming economic news
              </li>
              <li className="flex items-start gap-3 text-sm text-gray-600 line-through decoration-gray-600">
                <span className="text-gray-700 mt-0.5">✕</span>
                AI Predictions locked
              </li>
            </ul>

            <button 
              disabled
              className="w-full py-3 rounded-lg bg-gray-800 text-gray-400 font-bold cursor-not-allowed border border-gray-700"
            >
              Current Plan
            </button>
          </div>

          {/* 2. Pro Plan */}
          <div className="bg-[#0f1219] rounded-2xl p-6 border-2 border-blue-600 relative flex flex-col h-full transform md:-translate-y-4">
            <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white text-[10px] font-black px-4 py-1 rounded-full uppercase tracking-widest">
              Most Popular
            </div>

            <h3 className="text-xl font-bold text-white mb-2">Pro Plan</h3>
            <div className="text-4xl font-black text-white mb-6">
              $29 <span className="text-sm font-normal text-gray-500">/ month</span>
            </div>
            
            <ul className="space-y-4 mb-8 flex-1">
              <li className="flex items-start gap-3 text-sm text-gray-300">
                <span className="text-blue-500 mt-0.5">✓</span>
                View all economic data (No Blur)
              </li>
              <li className="flex items-start gap-3 text-sm text-gray-300">
                <span className="text-blue-500 mt-0.5">✓</span>
                Basic market analysis
              </li>
            </ul>

            <button 
              onClick={() => handleSubscribe('pro')}
              disabled={loading}
              className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all shadow-lg shadow-blue-900/50 disabled:opacity-50"
            >
              {loading ? 'Processing...' : 'Pay with USDT'}
            </button>
          </div>

          {/* 3. Elite Plan */}
          <div className="bg-[#0f1219] rounded-2xl p-6 border border-orange-500/50 hover:border-orange-500 flex flex-col h-full transition-colors">
            <h3 className="text-xl font-bold text-white mb-2">Elite Plan</h3>
            <div className="text-4xl font-black text-white mb-6">
              $59.99 <span className="text-sm font-normal text-gray-500">/ month</span>
            </div>
            
            <ul className="space-y-4 mb-8 flex-1">
              <li className="flex items-start gap-3 text-sm text-gray-300">
                <span className="text-orange-500 mt-0.5">✓</span>
                Unlock Multi-AI Modeling Predictions
              </li>
              <li className="flex items-start gap-3 text-sm text-gray-300">
                <span className="text-orange-500 mt-0.5">✓</span>
                Portfolio impact analysis
              </li>
              <li className="flex items-start gap-3 text-sm text-gray-300">
                <span className="text-orange-500 mt-0.5">✓</span>
                <span className="text-white font-bold">87% accuracy rate</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-gray-300">
                <span className="text-orange-500 mt-0.5">✓</span>
                Professional dashboard
              </li>
            </ul>

            <button 
              onClick={() => handleSubscribe('elite')}
              disabled={loading}
              className="w-full py-3 rounded-lg bg-orange-500 hover:bg-orange-400 text-black font-black transition-all shadow-lg shadow-orange-900/20 disabled:opacity-50"
            >
              {loading ? 'Processing...' : 'Pay with USDT'}
            </button>
          </div>

        </div>
        
        <p className="text-center text-gray-600 text-xs mt-8">
          Powered by NowPayments. Supports USDT (TRC20/ERC20).
        </p>
      </div>
    </div>
  );
};

export default PaymentModal;