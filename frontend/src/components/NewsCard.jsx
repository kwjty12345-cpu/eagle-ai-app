import React, { useState } from 'react';

// 🟢 模式 A: 本地开发
//const API_BASE = "http://localhost:5000";

// 🔴 模式 B: 生产环境
const API_BASE = "https://eagle-ai-app-production.up.railway.app";

const NewsCard = ({ eventGroup, userTier, onUnlock }) => {
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);
  // ✨ 新增：默认不显示结果，必须点击按钮后才变成 true
  const [revealed, setRevealed] = useState(false);

  // 🛠️ 权限核心逻辑
  const canSeeData = userTier === 'pro' || userTier === 'elite'; 
  const canUseAI = userTier === 'elite';                        

  // --- 👑 智能置顶逻辑 ---
  const priorityKeywords = [
    'Non-Farm', 'Unemployment Rate', 'CPI', 'GDP', 
    'FOMC Statement', 'Federal Funds Rate', 'Sentiment'
  ];

  const mainEvent = eventGroup.find(event => 
    priorityKeywords.some(keyword => event.title.includes(keyword))
  ) || eventGroup[0];
   
  // 检查是否有数据库存好的预测结果
  const existingPrediction = eventGroup[0].ai_prediction?.direction ? eventGroup[0].ai_prediction : null;

  const formatEventDate = (dateString) => {
    if (!dateString) return "Pending";
    const eventDate = new Date(dateString);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const timeStr = eventDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

    if (eventDate.getTime() > now.getTime() && eventDate.getDate() === now.getDate()) return `Today ${timeStr}`;
    if (eventDate.getDate() === today.getDate()) return `Today ${timeStr}`;
    if (eventDate.getDate() === tomorrow.getDate()) return `Tomorrow ${timeStr}`;
    
    return `${eventDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} ${timeStr}`;
  };

  // 判断是否是未来的新闻
  const isFuture = new Date(mainEvent.date) > new Date();
   
  const finalPrediction = prediction || existingPrediction;

  // --- AI 分析逻辑 ---
  const handleAnalyze = async () => {
    setLoading(true);

    // 1. 如果已经有数据库的数据，为了用户体验，我们模拟一个短暂的加载过程
    if (existingPrediction) {
      setTimeout(() => {
        setRevealed(true); // 揭示结果
        setLoading(false);
      }, 800); 
      return;
    }

    // 2. 如果没有数据，才去请求 API
    try {
      const payload = JSON.stringify(eventGroup);
      const url = `${API_BASE}/api/predict?data=${encodeURIComponent(payload)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`API Error: ${res.status}`);
      const result = await res.json();
      setPrediction(result);
      setRevealed(true); // 请求成功后，揭示结果
    } catch (error) {
      console.error("Analysis failed", error);
      setPrediction({ direction: "ERR", confidence: 0, confidenceLevel: "LOW", reason: "AI connection failed." });
      setRevealed(true); // 即使出错也显示错误信息
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`
      group relative overflow-hidden rounded-2xl mb-6
      transition-all duration-300 ease-out border
      ${isFuture 
        ? 'bg-slate-900/80 backdrop-blur-xl border-white/10 hover:-translate-y-1 hover:border-neon-purple/50 hover:shadow-[0_10px_40px_-10px_rgba(139,92,246,0.3)]' 
        : 'bg-black/40 border-white/5 opacity-80'
      }
    `}>
      {isFuture && (
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-neon-blue to-neon-purple opacity-50 group-hover:opacity-100 transition-opacity duration-300"></div>
      )}

      <div className="p-6">
        {/* --- Header (Shared for the group) --- */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex flex-wrap gap-2 items-center">
            <span className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest border ${isFuture ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50 shadow-[0_0_10px_rgba(250,204,21,0.2)]' : 'bg-gray-800 text-gray-500 border-gray-700'}`}>XAU/USD</span>
            <span className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${isFuture ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/20' : 'bg-slate-800 text-slate-500'}`}>{isFuture ? 'FUTURE' : 'PAST'}</span>
            <span className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${isFuture ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-gray-800 text-gray-600 border-gray-700'}`}>{mainEvent.impact}</span>
          </div>
          <div className="text-slate-400 text-xs font-mono font-medium">
              <span className={isFuture ? "text-white" : "text-gray-500"}>{formatEventDate(mainEvent.date)}</span>
          </div>
        </div>

        {/* --- List of Events (Looping) --- */}
        <div className="space-y-6 mb-8">
            {eventGroup.map((event, index) => (
                <div key={index} className={index > 0 ? "pt-6 border-t border-white/5" : ""}>
                    {/* Title */}
                    <h3 className={`font-extrabold text-xl mb-4 tracking-tight ${isFuture ? 'text-white' : 'text-gray-400'}`}>
                    {event.title}
                    </h3>

                    {/* Data Row */}
                    <div className="flex gap-12">
                        {/* Forecast */}
                        <div>
                            <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${isFuture ? 'text-neon-blue' : 'text-gray-600'}`}>Forecast</div>
                            {!canSeeData ? (
                                <div onClick={onUnlock} className="cursor-pointer flex items-center gap-1 bg-slate-800 px-3 py-1 rounded border border-slate-700 hover:border-cyan-400 transition-colors group/lock">
                                    <span className="text-sm">🔒</span> 
                                    <span className="text-xs font-bold text-slate-500 group-hover/lock:text-cyan-400">UNLOCK</span>
                                </div>
                            ) : (
                                <div className={`font-bold text-2xl font-mono ${isFuture ? 'text-white' : 'text-gray-500'}`}>
                                    {event.forecast || '--'}
                                </div>
                            )}
                        </div>

                        {/* Previous */}
                        <div>
                            <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">Previous</div>
                            {!canSeeData ? (
                                <div onClick={onUnlock} className="cursor-pointer text-slate-600 font-bold text-2xl font-mono blur-[4px] select-none hover:text-cyan-400 hover:blur-none transition-all">
                                    0.0%
                                </div>
                            ) : (
                                <div className="text-slate-500 font-bold text-2xl font-mono">
                                    {event.previous || '--'}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ))}
        </div>

        {/* --- Interactive Area (Only One per Card) --- */}
        {/* 🔥🔥🔥 修改区域开始：区分过去和未来 🔥🔥🔥 */}
        <div className="mt-2">
           {!isFuture ? (
               // 🔴 情况1: 如果是过去的新闻 -> 显示灰色禁止按钮
               <button
                 disabled
                 className="w-full py-4 rounded-xl font-bold text-xs uppercase tracking-widest text-gray-600 bg-gray-900/50 border border-gray-800 cursor-not-allowed flex items-center justify-center gap-2"
               >
                 <span>✕</span> Event Concluded
               </button>
           ) : (
               // 🟢 情况2: 如果是未来的新闻 -> 保持原有逻辑
               <>
                 {(!revealed || !canUseAI) ? (
                    <button 
                      onClick={canUseAI ? handleAnalyze : onUnlock}
                      disabled={loading && canUseAI}
                      className={`w-full py-4 rounded-xl font-black text-xs uppercase tracking-widest text-white border transition-all duration-300 active:scale-[0.98] flex items-center justify-center gap-2
                        ${canUseAI 
                          ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 border-blue-400/30 shadow-lg shadow-blue-900/40 hover:shadow-blue-500/50 hover:border-blue-300/60 hover:scale-[1.01] hover:brightness-110' 
                          : 'bg-gradient-to-r from-fuchsia-600 to-purple-600 border border-fuchsia-400/50 shadow-[0_0_15px_rgba(192,38,211,0.4)] text-white hover:brightness-125 hover:shadow-[0_0_25px_rgba(192,38,211,0.6)] animate-pulse-slow'
                        }`}
                    >
                      {loading && canUseAI ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-2 h-2 bg-white rounded-full animate-bounce"></span>
                          Analyzing...
                        </span>
                      ) : (
                         canUseAI ? "RUN MULTI-AI MODELING PREDICTION" : (
                             <span className="flex items-center gap-2 drop-shadow-md">
                                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-cyan-200">
                                   <path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3c0-2.9-2.35-5.25-5.25-5.25zm3.75 8.25v-3a3.75 3.75 0 10-7.5 0v3h7.5z" clipRule="evenodd" />
                                 </svg>
                                 <span className="text-cyan-50">UPGRADE TO UNLOCK MULTI-AI MODELING</span>
                             </span>
                         )
                      )}
                    </button>
                  ) : (
                    // Result Display (只有在 revealed = true 且有 finalPrediction 时才渲染)
                    finalPrediction && (
                      <div className="animate-fade-in">
                          <div className="grid grid-cols-3 border border-white/10 rounded-xl bg-slate-800/40 mb-4 divide-x divide-white/10 overflow-hidden relative">
                              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-neon-purple/5 to-transparent pointer-events-none"></div>
                              <div className="flex flex-col items-center justify-center py-5 relative z-10">
                                  <span className="text-slate-400 text-[9px] font-bold uppercase mb-2">Direction</span>
                                  <span className={`px-4 py-1.5 rounded text-white font-black text-sm uppercase ${finalPrediction.direction === 'BUY' ? 'bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.4)]' : finalPrediction.direction === 'SELL' ? 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)]' : 'bg-slate-600'}`}>{finalPrediction.direction}</span>
                              </div>
                              <div className="flex flex-col items-center justify-center py-5 relative z-10">
                                  <span className="text-slate-400 text-[9px] font-bold uppercase mb-2">Probability</span>
                                  <span className="text-white font-black text-xl drop-shadow-[0_0_5px_rgba(255,255,255,0.5)]">{finalPrediction.confidence}%</span>
                              </div>
                              <div className="flex flex-col items-center justify-center py-5 relative z-10">
                                  <span className="text-slate-400 text-[9px] font-bold uppercase mb-2">Confidence</span>
                                  <span className={`font-black text-sm uppercase ${finalPrediction.confidenceLevel === 'HIGH' ? 'text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.6)]' : finalPrediction.confidenceLevel === 'MED' ? 'text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]' : 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]'}`}>{finalPrediction.confidenceLevel || 'MED'}</span>
                              </div>
                          </div>
                          <div className="bg-slate-800/40 rounded-xl border border-white/5 p-4 border-l-2 border-l-yellow-500">
                              <div className="text-yellow-500 text-[9px] font-bold uppercase mb-2 tracking-wider">XAU/USD Logic</div>
                              <p className="text-slate-200 text-xs leading-relaxed">{finalPrediction.reason}</p>
                          </div>
                      </div>
                    )
                  )}
               </>
           )}
        </div>
        {/* 🔥🔥🔥 修改区域结束 🔥🔥🔥 */}
      </div>
    </div>
  );
};

export default NewsCard;