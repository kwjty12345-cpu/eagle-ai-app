import React, { useEffect, useState } from 'react';
// 👇 1. 引入 Firebase 相关
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";
// 👇 2. 引入 Login 组件
import Login from "./components/Login";

import NewsCard from './components/NewsCard';
import CalendarWidget from './components/CalendarWidget'; 
import PaymentModal from './components/PaymentModal';
import DisclaimerModal from './components/DisclaimerModal';

// 🟢 模式 A: 本地开发
// const API_BASE = "http://localhost:5000";

// 🔴 模式 B: 生产环境
const API_BASE = "eagle-ai-app-production.up.railway.app";

function App() {
  // 👇 3. 添加用户登录状态管理
  const [user, setUser] = useState(null); 
  const [authLoading, setAuthLoading] = useState(true); // 避免刷新时闪烁

  // 👇 4. 监听 Firebase 登录状态变化
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // 如果登录了，去后端同步一下数据 (获取 MongoDB 里的会员状态)
        try {
          const token = await currentUser.getIdToken();
          const response = await fetch(`${API_BASE}/api/users/sync`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            }
          });
          const userData = await response.json();
          setUser({ ...currentUser, ...userData }); // 合并 Firebase 和 MongoDB 的数据
        } catch (error) {
          console.error("同步用户数据失败:", error);
          setUser(currentUser); // 至少先让用户进去
        }
      } else {
        setUser(null);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 👇 【新增】监听 URL 参数，处理支付回调 (Stripe 跳转回来时)
  useEffect(() => {
    const checkPayment = async () => {
      // 1. 检查网址里有没有 session_id
      const query = new URLSearchParams(window.location.search);
      const sessionId = query.get('session_id');

      if (sessionId && user) { // 必须有 ID 且用户已登录
        try {
          // 2. 告诉后端去验票
          const token = await auth.currentUser.getIdToken(); // 获取 Firebase Token
          const res = await fetch(`${API_BASE}/api/payment/verify`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ session_id: sessionId })
          });
          
          const data = await res.json();
          
          if (data.status === 'success') {
            alert(`🎉 支付成功！您已升级为 ${data.plan.toUpperCase()} 会员！`);
            // 3. 刷新页面，去掉 URL 里的参数，让用户看到新状态
            window.history.replaceState({}, document.title, "/");
            window.location.reload(); 
          }
        } catch (err) {
          console.error("验证支付失败", err);
        }
      }
    };

    // 稍微延迟一点执行，确保 user 已经加载好了
    if (user && !authLoading) {
        checkPayment();
    }
  }, [user, authLoading]); // 依赖项：当用户状态加载完后执行


  // --- 原有逻辑 ---
  const [allNews, setAllNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  // 👇 将 userTier 默认值改为依赖用户数据
  const [userTier, setUserTier] = useState('free'); 
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [predicting, setPredicting] = useState(false);

  // 当用户数据加载完，自动设置会员等级
  useEffect(() => {
    if (user?.subscriptionStatus === 'active') { // 假设 active 是付费状态
      setUserTier(user.subscriptionPlan === 'elite' ? 'elite' : 'pro'); 
    } else {
      setUserTier('free');
    }
  }, [user]);

  const fetchNews = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/news`);
      const rawData = await response.json();
      setAllNews(rawData);
    } catch (error) {
      console.error("Failed to fetch news:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) { // 只有登录后才去拉取新闻
      fetchNews();
    }
  }, [user]); // 依赖 user 状态

  const handlePaymentSuccess = (planType = 'elite') => {
    setUserTier(planType);
    setShowModal(false);
    alert(`🎉 Upgraded to ${planType.toUpperCase()} Plan!`);
  };

  const groupEventsByTime = (events) => {
    const groups = {};
    events.forEach((event) => {
      if (!event.date) return;
      const d = new Date(event.date);
      if (isNaN(d.getTime())) return; 

      const key = d.toISOString().slice(0, 16); 
      
      if (!groups[key]) groups[key] = [];
      groups[key].push(event);
    });

    return Object.entries(groups).map(([key, groupEvents]) => ({
      keyStr: key, 
      time: new Date(groupEvents[0].date), 
      title: groupEvents[0].title,
      events: groupEvents
    }));
  };

  const now = new Date();
  const groupedNews = groupEventsByTime(allNews);

  const futureGroups = groupedNews
    .filter(group => group.time > now)
    .sort((a, b) => a.time - b.time);

  const pastGroups = groupedNews
    .filter(group => group.time <= now)
    .sort((a, b) => b.time - a.time);

  // 👇 5. 处理登出逻辑
  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
  };

  // 👇 6. 如果正在检查登录状态，显示一个全屏 Loading
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-eagle-gold"></div>
      </div>
    );
  }

  // 👇 7. 核心判断：如果没用户，显示登录页
  if (!user) {
    return <Login />;
  }

  // 👇 8. 如果有用户，显示原来的 Dashboard
  return (
    <div className="min-h-screen bg-eagle-bg px-4 py-8 font-sans flex flex-col"> 
      
      <header className="max-w-5xl mx-auto mb-10 flex justify-between items-center w-full">
        <div>
          <h1 className="text-2xl font-black text-white tracking-wide">
            EAGLE<span className="text-eagle-gold">.AI</span>
          </h1>
          <p className="text-gray-400 text-[10px] font-bold uppercase tracking-[0.2em] mt-1">
            Institutional Grade Signals
          </p>
        </div>
        
        <div className="flex items-center gap-4">
            {/* 显示当前用户邮箱 */}
            <span className="text-gray-400 text-xs hidden md:inline-block">{user.email}</span>
            
            <button 
                onClick={() => setShowModal(true)} 
                className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all duration-300 ${
                userTier === 'elite'
                ? 'border-yellow-400 text-yellow-400 bg-yellow-400/10 shadow-[0_0_15px_rgba(250,204,21,0.4)]'
                : userTier === 'pro'
                ? 'border-blue-400 text-blue-400 bg-blue-400/10'
                : 'border-white/30 text-white bg-white/5 hover:bg-white/10'
            }`}>
                {userTier === 'elite' ? 'ELITE PLAN' : userTier === 'pro' ? 'PRO PLAN' : 'FREE PLAN'}
            </button>

            {/* 登出按钮 */}
            <button 
                onClick={handleLogout}
                className="text-gray-500 hover:text-white text-xs font-bold uppercase tracking-wider"
            >
                Logout
            </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto pb-20 grid grid-cols-1 lg:grid-cols-3 gap-10 w-full flex-grow">
        
        <div className="lg:col-span-2 space-y-8">
          {loading ? (
            <div className="flex flex-col items-center mt-20">
               <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-eagle-gold mb-4"></div>
               <p className="text-gray-400 text-xs font-bold uppercase">Loading Data...</p>
            </div>
          ) : (
            <>
              {/* Future News */}
              {futureGroups.length > 0 && (
                <div className="mb-8">
                   <h2 className="text-eagle-gold text-xs font-black uppercase tracking-widest mb-4 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                      Upcoming Signals
                   </h2>
                   {futureGroups.map((group) => (
                      <NewsCard 
                        key={group.keyStr} 
                        eventGroup={group.events} 
                        userTier={userTier} 
                        onUnlock={() => setShowModal(true)} 
                      />
                   ))}
                </div>
              )}

              {/* Past News */}
              {pastGroups.length > 0 && (
                <div className="opacity-80 hover:opacity-100 transition-all duration-500">
                   <div className="w-full h-px bg-white/10 my-8"></div>
                   <h2 className="text-gray-500 text-xs font-black uppercase tracking-widest mb-4">
                      Past Events (Archive)
                   </h2>
                   <div className="flex flex-col gap-6">
                       {pastGroups.map((group) => (
                          <NewsCard 
                            key={group.keyStr}
                            eventGroup={group.events} 
                            userTier={userTier} 
                            onUnlock={() => setShowModal(true)} 
                          />
                       ))}
                   </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="hidden lg:block lg:col-span-1">
          <CalendarWidget events={allNews} />
          <div className="mt-8 p-6 rounded-2xl border border-white/5 bg-white/5 text-center">
             <h3 className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mb-2">Market Status</h3>
             <p className="text-green-400 text-xs font-bold uppercase animate-pulse">● Live Data Feed Active</p>
          </div>
        </div>

      </main>

      <footer className="max-w-5xl mx-auto w-full mt-auto pt-10 pb-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] text-gray-500 uppercase tracking-widest">
        <p>© 2026 Eagle.AI Inc. All rights reserved.</p>
        <div className="flex gap-6">
          <button onClick={() => setShowDisclaimer(true)} className="hover:text-eagle-gold transition-colors">Risk Disclosure</button>
          <button onClick={() => setShowDisclaimer(true)} className="hover:text-eagle-gold transition-colors">Terms of Use</button>
        </div>
      </footer>

      {showModal && (
        <PaymentModal 
          onClose={() => setShowModal(false)} 
          onUpgrade={handlePaymentSuccess} 
        />
      )}

      {showDisclaimer && <DisclaimerModal onClose={() => setShowDisclaimer(false)} />}
      
      {predicting && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999]">
           <div className="text-center">
             <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-eagle-gold mx-auto mb-4"></div>
             <div className="text-white font-bold text-xl animate-pulse tracking-widest">AI ANALYZING...</div>
           </div>
        </div>
      )}
    </div>
  );
}

export default App;