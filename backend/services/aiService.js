const Groq = require('groq-sdk');
const NewsEvent = require('../models/NewsEvent');
require('dotenv').config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// --- 黄金交易员专属逻辑 (Gold Trader System Prompt) ---
const GOLD_TRADER_PROMPT = `
You are a Wall Street Institutional Gold (XAU/USD) Trader with 20 years of experience.
Your job is to predict the IMMEDIATE reaction of Gold prices to economic news.

### YOUR BRAIN (THE LOGIC TREE):

1.  **THE USD YIELD CORRELATION (90% of cases):**
    * Gold pays zero interest. It HATES high yields.
    * IF News is **GOOD** for US Economy (e.g., Forecast > Previous for GDP, or Forecast < Previous for Jobless Claims) 
        -> Implies Strong Dollar & Higher Rates 
        -> **SELL GOLD**.
    * IF News is **BAD** for US Economy 
        -> Implies Weak Dollar & Lower Rates 
        -> **BUY GOLD**.

2.  **SPECIFIC INDICATOR RULES:**
    * **Unemployment Claims:** LOWER than forecast = Strong Labor = SELL GOLD. (Higher = BUY GOLD).
    * **NFP (Non-Farm):** HIGHER than forecast = Strong Labor = SELL GOLD.
    * **CPI / PPI (Inflation):** HIGHER than forecast = Fed must hike rates = SELL GOLD.
    * **GDP:** HIGHER than forecast = Strong Economy = SELL GOLD.

3.  **THE SAFE HAVEN EXCEPTION (Overrides all):**
    * If the event title mentions "War", "Geopolitical", "Terror", or "Crisis", IGNORE economic data.
    * **BUY GOLD** immediately.

### TASK:
Analyze the provided "Current News Events" combined with "Historical Context".
Determine the bias for XAU/USD.

### OUTPUT FORMAT (Strict JSON):
{
  "direction": "BUY" or "SELL",
  "confidence": number (70-95),
  "confidenceLevel": "HIGH" or "MED" or "LOW",
  "reason": "Professional trader jargon explaining why (e.g., 'Strong NFP boosts yields, bearish for Gold'). Max 20 words."
}
`;

const getPrediction = async (events) => {
  try {
    // 1. 提取主事件（用于查历史数据）
    const mainEvent = events[0];
    
    // 2. 查历史数据
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

    // 3. 构建组合数据描述
    const currentDataContext = events.map(e => 
      `Event: "${e.title}" | Forecast: ${e.forecast || 'N/A'} | Previous: ${e.previous || 'N/A'} | Impact: ${e.impact}`
    ).join('\n');

    // 4. 组装最终的用户 Prompt
    const userMessage = `
    Analyze this setup for XAU/USD (Gold):
    
    [CURRENT DATA RELEASES]
    ${currentDataContext}
    
    [HISTORICAL REACTION CONTEXT]
    ${historyContext}
    
    Apply the "Gold Trader Logic". Strong US Data = SELL Gold. Weak US Data = BUY Gold.
    `;

    console.log(`🧠 AI (Groq) Analyzing XAU/USD for: ${events.map(e => e.title).join(' + ')}`);

    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: GOLD_TRADER_PROMPT }, // 使用系统级指令注入人设
        { role: 'user', content: userMessage }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1, // 低温度，确保逻辑严密，不产生幻觉
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(completion.choices[0].message.content);
    
    // 确保返回的格式包含 confidenceLevel，防止前端报错
    if (!result.confidenceLevel) {
        result.confidenceLevel = result.confidence > 80 ? 'HIGH' : 'MED';
    }

    return result;

  } catch (error) {
    console.error('❌ AI Service Error:', error.message);
    // 兜底返回
    return { 
        direction: 'NEUTRAL', 
        confidence: 0, 
        confidenceLevel: 'LOW', 
        reason: "Market analysis unavailable." 
    };
  }
};

module.exports = { getPrediction };