import React, { useEffect, useState } from 'react';
import NewsCard from './components/NewsCard';
import CalendarWidget from './components/CalendarWidget'; // 1. 引入日历
import PaymentModal from './components/PaymentModal';

function App() {
  const [allNews, setAllNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isVIP, setIsVIP] = useState(false);

  const fetchNews = async () => {
    try {
      // 把这一行换成你截图里的那个网址 (注意后面要有 /api/news)
const response = await fetch('https://eagle-ai-app-production.up.railway.app/api/news');
      const rawData = await response.json();
      setAllNews(rawData);
    } catch (error) {
      console.error("Failed to fetch news:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNews();
  }, []);

  const handlePaymentSuccess = () => {
    setIsVIP(true);
    setShowModal(false);
    alert("🎉 VIP Mode Activated!");
  };

  // --- 分组逻辑 ---
  const groupNewsByTime = (newsList) => {
    const groups = {};
    newsList.forEach(item => {
      const timeKey = new Date(item.date).getTime();
      if (!groups[timeKey]) groups[timeKey] = [];
      groups[timeKey].push(item);
    });
    return Object.values(groups).sort((a, b) => new Date(a[0].date) - new Date(b[0].date));
  };

  const now = new Date();
  const groupedList = groupNewsByTime(allNews);

  const futureGroups = groupedList
    .filter(group => new Date(group[0].date) > now)
    .sort((a, b) => new Date(a[0].date) - new Date(b[0].date)); 

  const pastGroups = groupedList
    .filter(group => new Date(group[0].date) <= now)
    .sort((a, b) => new Date(b[0].date) - new Date(a[0].date)); 

  return (
    <div className="min-h-screen bg-eagle-bg px-4 py-8 font-sans">
      
      {/* --- Header (宽度调整为 max-w-5xl 以匹配下文) --- */}
      <header className="max-w-5xl mx-auto mb-10 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black text-white tracking-wide">
            EAGLE<span className="text-eagle-gold">.AI</span>
          </h1>
          <p className="text-gray-400 text-[10px] font-bold uppercase tracking-[0.2em] mt-1">
            Institutional Grade Signals
          </p>
        </div>
        
        <button 
          onClick={() => !isVIP && setShowModal(true)} 
          className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all duration-300 ${
          isVIP 
            ? 'border-yellow-400 text-yellow-400 bg-yellow-400/10 shadow-[0_0_15px_rgba(250,204,21,0.4)]' 
            : 'border-white/30 text-white bg-white/5 hover:bg-white/10'
        }`}>
          {isVIP ? 'PREMIUM ACTIVE' : 'FREE PLAN'}
        </button>
      </header>

      {/* --- Main Content (双栏布局) --- */}
      {/* 2. 宽度改为 max-w-5xl，并开启 Grid 布局 */}
      <main className="max-w-5xl mx-auto pb-20 grid grid-cols-1 lg:grid-cols-3 gap-10">
        
        {/* === 左侧：新闻流 (占据 2/3 宽度) === */}
        <div className="lg:col-span-2">
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
                   {futureGroups.map((group, index) => (
                      <NewsCard 
                        key={index} 
                        eventGroup={group} 
                        isVIP={isVIP}
                        onUnlockRequest={() => setShowModal(true)} 
                      />
                   ))}
                </div>
              )}

              {/* Past News */}
              {pastGroups.length > 0 && (
                <div className="opacity-60 grayscale-[0.8] hover:opacity-100 hover:grayscale-0 transition-all duration-500">
                   <div className="w-full h-px bg-white/10 my-8"></div>
                   <h2 className="text-gray-500 text-xs font-black uppercase tracking-widest mb-4">
                      Past Events (Archive)
                   </h2>
                   {pastGroups.map((group, index) => (
                      <NewsCard 
                        key={`past-${index}`} 
                        eventGroup={group} 
                        isVIP={isVIP}
                        onUnlockRequest={() => {}} 
                      />
                   ))}
                </div>
              )}

              {allNews.length === 0 && (
                <div className="text-center text-gray-500 mt-20 text-sm">No events found.</div>
              )}
            </>
          )}
        </div>

        {/* === 右侧：日历小部件 (占据 1/3 宽度) === */}
        <div className="hidden lg:block lg:col-span-1">
          {/* 3. 传入 allNews 数据，让日历知道哪天标红 */}
          <CalendarWidget events={allNews} />
          
          {/* 额外的空白区域填充 (可选) */}
          <div className="mt-8 p-6 rounded-2xl border border-white/5 bg-white/5 text-center">
             <h3 className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mb-2">Market Status</h3>
             <p className="text-green-400 text-xs font-bold uppercase animate-pulse">● Live Data Feed Active</p>
          </div>
        </div>

      </main>

      {showModal && (
        <PaymentModal 
          onClose={() => setShowModal(false)} 
          onUpgrade={handlePaymentSuccess} 
        />
      )}
    </div>
  );
}

export default App;