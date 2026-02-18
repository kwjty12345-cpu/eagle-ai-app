import { useState, useEffect } from 'react';

export const useNewsCountdown = (events) => {
  // 保存当前系统时间
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // 保存全局市场状态
  const [marketStatus, setMarketStatus] = useState({
    isAlert: false,      
    text: "LIVE DATA FEED ACTIVE", 
    color: "text-green-400",       
    dotColor: "bg-green-400"
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now); // 每秒更新当前时间
      
      if (!events || events.length === 0) {
          setMarketStatus({
            isAlert: false,
            text: "LIVE DATA FEED ACTIVE",
            color: "text-green-400",
            dotColor: "bg-green-400"
          });
          return;
      }

      // 检查是否全局有任何新闻进入了 10 分钟内
      const nextEvent = events.find(event => new Date(event.date).getTime() > now.getTime());

      if (nextEvent) {
        const timeDiff = new Date(nextEvent.date).getTime() - now.getTime();
        
        if (timeDiff <= 600000 && timeDiff > 0) {
          setMarketStatus({
            isAlert: true,
            text: "HIGH IMPACT EVENT INCOMING", // 全局警报文字
            color: "text-red-500", 
            dotColor: "bg-red-500 animate-pulse" 
          });
        } else {
          setMarketStatus({
            isAlert: false,
            text: "LIVE DATA FEED ACTIVE",
            color: "text-green-400",
            dotColor: "bg-green-400"
          });
        }
      } else {
         setMarketStatus({
            isAlert: false,
            text: "NO MORE EVENTS TODAY",
            color: "text-gray-500",
            dotColor: "bg-gray-500"
          });
      }
    }, 1000); 

    return () => clearInterval(timer);
  }, [events]); 

  return { currentTime, marketStatus };
};