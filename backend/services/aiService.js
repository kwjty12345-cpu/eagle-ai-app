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
1.  **Actual > Forecast (Positive Surprise for US Data):**
    * *Examples:* CPI, PPI, NFP, GDP, Retail Sales.
    * *Result:* USD Spikes ⬆️, Yields ⬆️.
    * *Action:* **SELL GOLD**.
    * *Exception:* For "Jobless Claims" or "Unemployment Rate", Higher Actual = Weak Economy = **BUY GOLD**.

2.  **Actual < Forecast (Negative Surprise for US Data):**
    * *Examples:* CPI, PPI, NFP, GDP, Retail Sales.
    * *Result:* USD Dumps ⬇️, Yields ⬇️.
    * *Action:* **BUY GOLD**.
    * *Exception:* For "Jobless Claims", Lower Actual = Strong Economy = **SELL GOLD**.

**🟡 SCENARIO B: PRE-RELEASE (We only have Forecast)**
1.  **Forecast > Previous:** Market *expects* stronger US data. Priced in for a USD rally. Bias: **SELL GOLD**.
    * Calculate confidence based on the magnitude of difference: Large gap (>0.5% for rates, >5% for indices) = HIGH confidence (85-95). Small gap = MED confidence (70-84).
2.  **Forecast < Previous:** Market *expects* weaker US data. Priced in for a USD drop. Bias: **BUY GOLD**.
    * Calculate confidence based on the magnitude of difference: Large gap (>0.5% for rates, >5% for indices) = HIGH confidence (85-95). Small gap = MED confidence (70-84).
3.  **Forecast = Previous or Previous is N/A:** Market expects no change. This is NEUTRAL with LOW confidence (60-65).
    * However, consider event type: For inflation data (CPI, PCE), even no change can be significant. For GDP, no change might indicate stagnation = slight BUY bias with MED confidence (70-75).

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

    // 3. 构建组合数据描述 (增强版：强调 Actual 和数值差异)
    const currentDataContext = events.map((e, index) => {
       // 检查是否有 Actual 数据（actual 可能是字符串，需要检查是否为空或只是空白）
       const hasActual = e.actual && typeof e.actual === 'string' && e.actual.trim().length > 0 && e.actual.trim() !== '--';
       
       // 计算数值差异（用于提高预测准确性）
       let deviation = null;
       let deviationType = null;
       
       if (hasActual) {
         // 如果有Actual，计算Actual vs Forecast的偏差
         const actualNum = parseFloat(e.actual.replace(/[^0-9.-]/g, ''));
         const forecastNum = parseFloat((e.forecast || '0').replace(/[^0-9.-]/g, ''));
         if (!isNaN(actualNum) && !isNaN(forecastNum)) {
           deviation = Math.abs(actualNum - forecastNum);
           deviationType = actualNum > forecastNum ? 'POSITIVE_SURPRISE' : 'NEGATIVE_SURPRISE';
         }
       } else if (e.forecast && e.previous && e.previous !== '--' && e.previous !== 'N/A') {
         // 如果没有Actual，计算Forecast vs Previous的差异
         const forecastNum = parseFloat(e.forecast.replace(/[^0-9.-]/g, ''));
         const previousNum = parseFloat(e.previous.replace(/[^0-9.-]/g, ''));
         if (!isNaN(forecastNum) && !isNaN(previousNum)) {
           deviation = Math.abs(forecastNum - previousNum);
           deviationType = forecastNum > previousNum ? 'EXPECTED_STRONGER' : 'EXPECTED_WEAKER';
         }
       }
       
       return `
       EVENT #${index + 1}: "${e.title}"
       EVENT TYPE: ${e.title.includes('GDP') ? 'GDP_GROWTH' : e.title.includes('CPI') || e.title.includes('PCE') ? 'INFLATION' : e.title.includes('PMI') ? 'MANUFACTURING' : e.title.includes('Unemployment') || e.title.includes('Jobless') ? 'EMPLOYMENT' : 'OTHER'}
       IMPACT: ${e.impact}
       STATUS: ${hasActual ? "RELEASED (Use Actual vs Forecast)" : "UPCOMING (Use Forecast vs Previous)"}
       -----------------------
       PREVIOUS: ${e.previous || 'N/A'}
       FORECAST: ${e.forecast || 'N/A'}
       ACTUAL:   ${hasActual ? e.actual : 'WAITING...'}
       ${deviation !== null ? `DEVIATION: ${deviation.toFixed(3)} (${deviationType})` : 'DEVIATION: Cannot calculate'}
       `;
    }).join('\n');

    // 4. 组装最终的用户 Prompt
    const userMessage = `
    Analyze this specific market setup for XAU/USD (Gold). You MUST provide DIFFERENT predictions for DIFFERENT events based on their unique data.

    [CURRENT MARKET DATA]
    ${currentDataContext}
    
    [HISTORICAL PERFORMANCE (Context)]
    ${historyContext}
    
    [CRITICAL INSTRUCTIONS - READ CAREFULLY]
    1. Each event is UNIQUE. You MUST analyze each event INDIVIDUALLY based on:
       - Event type (GDP, CPI, PCE, PMI, Employment, etc.)
       - Deviation magnitude (large deviations = higher confidence)
       - Impact level (High impact events = higher confidence potential)
    
    2. If "ACTUAL" data is present:
       - Calculate the deviation between Actual and Forecast
       - Large positive surprise (>0.5% for rates, >5% for indices) = SELL with HIGH confidence (85-95)
       - Large negative surprise = BUY with HIGH confidence (85-95)
       - Small deviation (<0.2% for rates, <2% for indices) = NEUTRAL with LOW confidence (60-70)
    
    3. If "ACTUAL" is MISSING (UPCOMING):
       - Compare Forecast vs Previous
       - If Forecast > Previous significantly (>0.3% difference): SELL with MED-HIGH confidence (75-88)
       - If Forecast < Previous significantly: BUY with MED-HIGH confidence (75-88)
       - If Forecast = Previous or difference is minimal: 
         * For inflation data (CPI, PCE): NEUTRAL with MED confidence (70-75) - no change can be significant
         * For GDP: Slight BUY bias with MED confidence (70-75) - stagnation concerns
         * For PMI: NEUTRAL with LOW confidence (60-65)
         * For Employment: Analyze based on event type
    
    4. IMPORTANT: DO NOT return the same prediction for different events. Each event has unique characteristics.
       - Different event types should have different confidence levels
       - Different deviations should result in different directions and confidence
       - Even if Forecast = Previous, consider the event type and context
    
    5. Apply the correlation: Strong US Econ Data -> Strong USD -> SELL XAU/USD.
       Weak US Econ Data -> Weak USD -> BUY XAU/USD.
    `;

    console.log(`🧠 AI (Groq) Analyzing XAU/USD for: ${events.map(e => e.title).join(' + ')}`);

    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: GOLD_TRADER_PROMPT },
        { role: 'user', content: userMessage }
      ],
      model: 'llama-3.3-70b-versatile', // 推荐模型
      temperature: 0.3, // 提高温度以增加多样性，但仍保持准确性
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(completion.choices[0].message.content);
    
    // 5. 数据验证和兜底逻辑
    // 确保 direction 是有效的值
    if (!result.direction || !['BUY', 'SELL', 'NEUTRAL'].includes(result.direction.toUpperCase())) {
        result.direction = 'NEUTRAL';
    } else {
        result.direction = result.direction.toUpperCase();
    }
    
    // 确保 confidence 是数字类型，且在有效范围内
    if (typeof result.confidence !== 'number') {
        result.confidence = parseInt(result.confidence) || 60;
    }
    // 限制 confidence 在 60-99 范围内
    result.confidence = Math.max(60, Math.min(99, result.confidence));
    
    // 确保 confidenceLevel 存在且有效
    if (!result.confidenceLevel || !['HIGH', 'MED', 'LOW'].includes(result.confidenceLevel.toUpperCase())) {
        if (result.confidence >= 85) result.confidenceLevel = 'HIGH';
        else if (result.confidence >= 70) result.confidenceLevel = 'MED';
        else result.confidenceLevel = 'LOW';
    } else {
        result.confidenceLevel = result.confidenceLevel.toUpperCase();
    }
    
    // 确保 reason 存在
    if (!result.reason || typeof result.reason !== 'string') {
        result.reason = 'Analysis completed';
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