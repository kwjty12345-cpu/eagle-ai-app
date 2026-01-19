const Groq = require('groq-sdk');
const NewsEvent = require('../models/NewsEvent');
require('dotenv').config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// --- 👑 华尔街黄金交易员核心逻辑 (Enhanced System Prompt) ---
const GOLD_TRADER_PROMPT = `
You are a Wall Street Institutional Gold (XAU/USD) Algo-Trader with 25 years of experience.
Your sole job is to signal BUY or SELL for Gold based on economic data releases.

### 🧠 CORE LOGIC ENGINE (THE "ALGO"):

**PHASE 1: DATA AVAILABILITY CHECK**
* **IF "Actual" value exists:** The news has just been released. IGNORING "Forecast" vs "Previous". The ONLY thing that matters is **"Actual" vs "Forecast"**.
* **IF "Actual" is missing:** The news is upcoming. You must predict based on the trend between "Forecast" and "Previous" and Historical Context.

**PHASE 2: THE GOLD CORRELATION MATRIX (Crucial)**
* **Gold (XAU) vs USD:** Gold is priced in Dollars. Strong USD = WEAK Gold. Weak USD = STRONG Gold.
* **Gold vs Yields:** Gold pays 0% interest. High Rates/Yields = SELL Gold. Low Rates/Yields = BUY Gold.

**PHASE 3: SCENARIO ANALYSIS (Strict Rules)**

**🟢 SCENARIO A: NEWS RELEASED (We have Actual)**
1.  **Actual > Forecast (Positive Surprise for US Data):**
    * *Examples:* CPI, PPI, NFP, GDP, Retail Sales.
    * *Result:* USD Spikes ⬆️, Yields ⬆️.
    * *Action:* **SELL GOLD**.
    * *Exception:* For "Jobless Claims" or "Unemployment Rate", Higher Actual = Weak Economy = **BUY GOLD**.

2.  **Actual < Forecast (Negative Surprise for US Data):**
    * *Examples:* CPI, PPI, NFP, GDP, Retail Sales.
    * *Result:* USD Dumps ⬇️, Yields ⬇️.
    * *Action:* **BUY GOLD**.
    * *Exception:* For "Jobless Claims", Lower Actual = Strong Economy = **SELL GOLD**.

**🟡 SCENARIO B: PRE-RELEASE (We only have Forecast)**
1.  **Forecast > Previous:** Market *expects* stronger US data. Priced in for a USD rally. Bias: **SELL GOLD**.
2.  **Forecast < Previous:** Market *expects* weaker US data. Priced in for a USD drop. Bias: **BUY GOLD**.

### ⚠️ CRITICAL EXCEPTIONS (SAFE HAVEN):
If the event title contains "War", "Terror", "Geopolitical", "Crisis", or "Attack":
* **IGNORE ALL DATA.**
* **DIRECTION: BUY.**
* **REASON:** Safe haven demand spikes during fear.

### OUTPUT FORMAT (Strict JSON):
{
  "direction": "BUY" or "SELL" or "NEUTRAL",
  "confidence": number (Integer 60-99),
  "confidenceLevel": "HIGH" or "MED" or "LOW",
  "reason": "Concise, professional trader commentary. Use terms like 'Hawkish', 'Dovish', 'Deviation', 'Yields'. Max 25 words."
}
`;

const getPrediction = async (events) => {
  try {
    // 1. 提取主事件（用于查历史数据）
    const mainEvent = events[0];
    
    // 2. 查历史数据 (保留你的逻辑，这很好)
    let historyContext = "No historical data available.";
    try {
        const history = await NewsEvent.find({ title: mainEvent.title, date: { $lt: new Date() } })
          .sort({ date: -1 })
          .limit(3)
          .select('date forecast previous impact actual');
        
        if(history.length > 0) {
            historyContext = JSON.stringify(history);
        }
    } catch (err) {
        console.warn("History fetch skipped:", err.message);
    }

    // 3. 构建组合数据描述 (增强版：强调 Actual + 🔥 新增时间锁逻辑)
    // 获取当前时间，用于判断事件是否已经发生
    const now = new Date(); 

    const currentDataContext = events.map(e => {
       const eventDate = new Date(e.date);
       // 🔥 关键修改：如果事件时间 > 当前时间，说明是“未来”，强制认为 Actual 为空
       const isFuture = eventDate > now;
       
       // 如果是未来，把 actual 设为空字符串；如果是过去/现在，使用数据库里的 actual
       const cleanActual = isFuture ? "" : e.actual;

       // 检查是否有 Actual 数据 (使用处理过的 cleanActual)
       const hasActual = cleanActual && cleanActual.length > 0;

       return `
       EVENT: "${e.title}"
       IMPACT: ${e.impact}
       STATUS: ${hasActual ? "RELEASED (Use Actual vs Forecast)" : "UPCOMING (Use Forecast vs Previous)"}
       TIME_CHECK: ${isFuture ? "FUTURE EVENT (Prediction Mode)" : "PAST EVENT"}
       -----------------------
       PREVIOUS: ${e.previous || 'N/A'}
       FORECAST: ${e.forecast || 'N/A'}
       ACTUAL:   ${cleanActual || 'WAITING...'} 
       `;
    }).join('\n');

    // 4. 组装最终的用户 Prompt
    const userMessage = `
    Analyze this specific market setup for XAU/USD (Gold).

    [CURRENT MARKET DATA]
    ${currentDataContext}
    
    [HISTORICAL PERFORMANCE (Context)]
    ${historyContext}
    
    [INSTRUCTIONS]
    1. Check if "ACTUAL" data is present.
    2. If PRESENT: Compare Actual vs Forecast. Calculate the deviation. Large deviation = High Confidence.
    3. If MISSING: Compare Forecast vs Previous to determine market sentiment.
    4. Apply the correlation: Strong US Econ Data -> Strong USD -> SELL XAU/USD.
    `;

    console.log(`🧠 AI (Groq) Analyzing XAU/USD for: ${events.map(e => e.title).join(' + ')}`);

    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: GOLD_TRADER_PROMPT },
        { role: 'user', content: userMessage }
      ],
      model: 'llama-3.3-70b-versatile', // 推荐模型
      temperature: 0.1, // 保持低创造性，高准确性
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(completion.choices[0].message.content);
    
    // 5. 兜底逻辑：确保 confidenceLevel 存在
    if (!result.confidenceLevel) {
        if (result.confidence >= 85) result.confidenceLevel = 'HIGH';
        else if (result.confidence >= 70) result.confidenceLevel = 'MED';
        else result.confidenceLevel = 'LOW';
    }

    return result;

  } catch (error) {
    console.error('❌ AI Service Error:', error.message);
    return { 
        direction: 'NEUTRAL', 
        confidence: 0, 
        confidenceLevel: 'LOW', 
        reason: "AI analysis unavailable. Check connection." 
    };
  }
};

module.exports = { getPrediction };