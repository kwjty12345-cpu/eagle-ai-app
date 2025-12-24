import React, { useState } from 'react';

const NewsCard = ({ eventGroup, isVIP, onUnlockRequest }) => {
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);

  // 1. 界面只展示第一个事件 (主事件)
  const mainEvent = eventGroup[0];
  
  // 判断是否有隐藏数据 (同一时间有多个事件)
  const hasHiddenData = eventGroup.length > 1;

  const formatEventDate = (dateString) => {
    if (!dateString) return "Pending";
    const eventDate = new Date(dateString);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const eventDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
    const timeStr = eventDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

    if (eventDay.getTime() === today.getTime()) {
      return `Today ${timeStr}`;
    } else if (eventDay.getTime() === tomorrow.getTime()) {
      return `Tomorrow ${timeStr}`;
    } else {
      const dateStr = eventDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      return `${dateStr} ${timeStr}`;
    }
  };

  const isFuture = new Date(mainEvent.date) > new Date();

  // --- AI 分析逻辑 ---
  const handleAnalyze = async () => {
    if (!isFuture) return;
    
    setLoading(true);
    try {
      // 2. 关键：发送给 AI 的是整个 eventGroup (包含主数据和隐藏数据)
      const payload = JSON.stringify(eventGroup);
      
      const url = `http://localhost:5000/api/predict?data=${encodeURIComponent(payload)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`API Error: ${res.status}`);
      const result = await res.json();
      setPrediction(result);
    } catch (error) {
      console.error("Analysis failed", error);
      setPrediction({ direction: "ERR", confidence: 0, confidenceLevel: "LOW", reason: "AI connection failed." });
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
        {/* --- Header --- */}
        <div className="flex justify-between items-center mb-5">
          <div className="flex flex-wrap gap-2 items-center">
            
            <span className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest border ${
              isFuture
              ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50 shadow-[0_0_10px_rgba(250,204,21,0.2)]'
              : 'bg-gray-800 text-gray-500 border-gray-700'
            }`}>
              XAU/USD
            </span>

            <span className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
              isFuture 
              ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/20' 
              : 'bg-slate-800 text-slate-500'
            }`}>
              {isFuture ? 'FUTURE' : 'PAST'}
            </span>
            
            <span className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${
              isFuture
              ? 'bg-red-500/10 text-red-400 border-red-500/20'
              : 'bg-gray-800 text-gray-600 border-gray-700'
            }`}>
              {mainEvent.impact}
            </span>

            {/* 3. 隐藏数据提示 (可选，如果您想要完全隐藏可删除此段) */}
            {hasHiddenData && isFuture && (
               <span className="px-2 py-1 rounded text-[9px] font-bold uppercase border border-white/10 text-slate-400">
                  + DATA
               </span>
            )}

          </div>
          <div className="text-slate-400 text-xs font-mono font-medium">
             <span className={isFuture ? "text-white" : "text-gray-500"}>
               {formatEventDate(mainEvent.date)}
             </span>
          </div>
        </div>

        {/* --- Title --- */}
        <h3 className={`font-extrabold text-xl mb-6 tracking-tight ${isFuture ? 'text-white' : 'text-gray-400'}`}>
          {mainEvent.title}
        </h3>

        {/* --- Data --- */}
        <div className="flex gap-12 mb-8">
          <div>
            <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${isFuture ? 'text-neon-blue' : 'text-gray-600'}`}>Forecast</div>
            <div className={`font-bold text-2xl font-mono ${isFuture ? 'text-white' : 'text-gray-500'}`}>{mainEvent.forecast || '--'}</div>
          </div>
          <div>
            <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">Previous</div>
            <div className="text-slate-500 font-bold text-2xl font-mono">{mainEvent.previous || '--'}</div>
          </div>
        </div>

        {/* --- Interactive Area --- */}
        {isFuture && (
          <div>
            {!isVIP ? (
              <div className="bg-slate-800/50 rounded-xl border border-white/5 p-4 flex justify-between items-center backdrop-blur-sm">
                <div>
                    <div className="text-white font-bold text-sm">Signal Locked</div>
                    <div className="text-slate-400 text-xs">Unlock to view Gold prediction</div>
                </div>
                <button onClick={onUnlockRequest} className="px-6 py-2 rounded-lg font-bold text-xs uppercase text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:shadow-lg transition-all">
                    Unlock
                </button>
              </div>
            ) : (
              !prediction ? (
                <button 
                  onClick={handleAnalyze}
                  disabled={loading}
                  className="w-full py-4 rounded-xl font-black text-sm uppercase tracking-widest text-white 
                  bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 
                  border border-blue-400/30
                  shadow-lg shadow-blue-900/40
                  hover:shadow-blue-500/50 hover:border-blue-300/60 hover:scale-[1.01] hover:brightness-110
                  transition-all duration-300 active:scale-[0.98]"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-2 h-2 bg-white rounded-full animate-bounce"></span>
                      Analyzing Combined Data...
                    </span>
                  ) : "Run AI Prediction"}
                </button>
              ) : (
                <div className="animate-fade-in">
                    <div className="grid grid-cols-3 border border-white/10 rounded-xl bg-slate-800/40 mb-4 divide-x divide-white/10 overflow-hidden relative">
                        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-neon-purple/5 to-transparent pointer-events-none"></div>

                        <div className="flex flex-col items-center justify-center py-5 relative z-10">
                            <span className="text-slate-400 text-[9px] font-bold uppercase mb-2">Gold Direction</span>
                            <span className={`px-4 py-1.5 rounded text-white font-black text-sm uppercase ${
                                prediction.direction === 'BUY' ? 'bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.4)]' : 
                                prediction.direction === 'SELL' ? 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)]' : 'bg-slate-600'
                            }`}>
                                {prediction.direction}
                            </span>
                        </div>

                        <div className="flex flex-col items-center justify-center py-5 relative z-10">
                            <span className="text-slate-400 text-[9px] font-bold uppercase mb-2">Probability</span>
                            <span className="text-white font-black text-xl drop-shadow-[0_0_5px_rgba(255,255,255,0.5)]">
                                {prediction.confidence}%
                            </span>
                        </div>

                        <div className="flex flex-col items-center justify-center py-5 relative z-10">
                            <span className="text-slate-400 text-[9px] font-bold uppercase mb-2">Confidence</span>
                            <span className={`font-black text-sm uppercase ${
                                 prediction.confidenceLevel === 'HIGH' ? 'text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.6)]' : 
                                 prediction.confidenceLevel === 'MED' ? 'text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]' : 
                                 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]'
                            }`}>
                                {prediction.confidenceLevel || 'MED'}
                            </span>
                        </div>
                    </div>

                    <div className="bg-slate-800/40 rounded-xl border border-white/5 p-4 border-l-2 border-l-yellow-500">
                        <div className="text-yellow-500 text-[9px] font-bold uppercase mb-2 tracking-wider">XAU/USD Logic</div>
                        <p className="text-slate-200 text-xs leading-relaxed">
                            {prediction.reason}
                        </p>
                    </div>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default NewsCard;