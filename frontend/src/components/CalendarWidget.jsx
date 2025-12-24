import React, { useState } from 'react';

const CalendarWidget = ({ events }) => {
  const [currentDate, setCurrentDate] = useState(new Date());

  // 获取当月有多少天
  const getDaysInMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  // 获取当月第一天是星期几
  const getFirstDayOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  // 切换月份
  const changeMonth = (offset) => {
    const newDate = new Date(currentDate.setMonth(currentDate.getMonth() + offset));
    setCurrentDate(new Date(newDate));
  };

  const daysInMonth = getDaysInMonth(currentDate);
  const firstDay = getFirstDayOfMonth(currentDate);
  
  // 生成日历格子
  const days = [];
  // 填充空白 (上个月的残留)
  for (let i = 0; i < firstDay; i++) {
    days.push(<div key={`empty-${i}`} className="p-2"></div>);
  }

  // 检查某一天是否有新闻
  const hasEvent = (day) => {
    return events.some(event => {
      const eventDate = new Date(event.date);
      return (
        eventDate.getDate() === day &&
        eventDate.getMonth() === currentDate.getMonth() &&
        eventDate.getFullYear() === currentDate.getFullYear()
      );
    });
  };

  // 填充日期
  for (let day = 1; day <= daysInMonth; day++) {
    const isToday = 
      day === new Date().getDate() && 
      currentDate.getMonth() === new Date().getMonth() && 
      currentDate.getFullYear() === new Date().getFullYear();

    const hasNews = hasEvent(day);

    days.push(
      <div key={day} className="aspect-square flex items-center justify-center relative">
        <div className={`
          w-8 h-8 flex items-center justify-center rounded-full text-xs font-bold transition-all
          ${isToday ? 'border border-eagle-gold text-eagle-gold' : 'text-gray-300'}
          ${hasNews ? 'bg-red-600 text-white shadow-[0_0_10px_rgba(220,38,38,0.5)]' : 'hover:bg-white/10'}
        `}>
          {day}
        </div>
      </div>
    );
  }

  const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  return (
    <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl sticky top-8">
      {/* 顶部：月份控制 */}
      <div className="flex justify-between items-center mb-6">
        <button onClick={() => changeMonth(-1)} className="text-gray-400 hover:text-white transition-colors">
          &lt;
        </button>
        <h3 className="text-eagle-gold font-black uppercase tracking-widest text-sm">
          {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
        </h3>
        <button onClick={() => changeMonth(1)} className="text-gray-400 hover:text-white transition-colors">
          &gt;
        </button>
      </div>

      {/* 星期头 */}
      <div className="grid grid-cols-7 mb-2 text-center">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className="text-[10px] font-bold text-gray-500 uppercase">
            {d}
          </div>
        ))}
      </div>

      {/* 日期网格 */}
      <div className="grid grid-cols-7 gap-1 text-center">
        {days}
      </div>

      {/* 图例 */}
      <div className="mt-6 flex items-center justify-center gap-2 text-[10px] text-gray-500 uppercase font-bold tracking-wider">
        <div className="w-2 h-2 rounded-full bg-red-600 shadow-[0_0_5px_rgba(220,38,38,0.5)]"></div>
        <span>High Impact Event</span>
      </div>
    </div>
  );
};

export default CalendarWidget;