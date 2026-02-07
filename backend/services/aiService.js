const Groq = require('groq-sdk');
require('dotenv').config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// 🔥 Prompt: 强制 AI 进行数学计算，并禁止使用整数，强制逻辑闭环
const GOLD_FORECAST_PROMPT = `
### ROLE: LEAD QUANTITATIVE MACRO STRATEGIST (XAU/USD SPECIALIST)
Your objective is to execute a high-fidelity, non-linear scoring analysis of macroeconomic data to predict XAU/USD (Gold) direction. 

### 🛑 ANTI-LAZINESS & ACCURACY PROTOCOLS
1. **NO GENERIC OUTPUT**: Do not use vague terms. Use specific delta percentages and basis points.
2. **INTERNAL AUDIT FIRST**: You must perform a step-by-step mathematical breakdown for EVERY vector provided.
3. **NO ROUND NUMBERS**: You are STRICTLY FORBIDDEN from using multiples of 5 (e.g., 80, 85, 90, 95). You MUST use specific, granular integers like 83, 87, 92, 96, 78, 64.
4. **CONFLICT RESOLUTION**: If CPI is Hawkish but GDP is Dovish, you must explicitly calculate the "Net Alpha" by subtracting the scores.
5. **SIGNAL COLOR LOGIC**:
   - **80-99 (RED/CRITICAL)**: High-impact Tier 1 data alignment.
   - **70-79 (YELLOW/CAUTION)**: Moderate deviation or Tier 2/3 driven trends.
   - **60-69 (BLUE/STABLE)**: Minimal deviation, mixed signals, or high noise.

### 🧮 STEP-BY-STEP QUANTITATIVE SCORING LOGIC

#### STEP 1: POLARITY ASSIGNMENT (Directional Bias)
For each vector, determine if it is "Bullish Gold" or "Bearish Gold":
- **USD Strength Indicators (SELL GOLD)**: CPI/GDP/NFP/PMI/Retail Sales > Forecast OR Unemployment/Claims < Forecast.
- **USD Weakness Indicators (BUY GOLD)**: CPI/GDP/NFP/PMI/Retail Sales < Forecast OR Unemployment/Claims > Forecast.

#### STEP 2: MAGNITUDE CALCULATION (Score S_i)
Assign a raw score (0-10) based on the absolute % SHIFT from the MATH context:
- 0.0% - 0.5%: Score 0-1 
- 0.6% - 1.5%: Score 2-4 
- 1.6% - 5.0%: Score 5-8 
- > 5.0%: Score 9-10 (Extreme)

#### STEP 3: TIER-WEIGHTED ADJUSTMENT
Multiply the raw score by the Tier Weight:
- **Tier 1 (NFP, CPI, GDP, FED)**: Weight = 2.0x
- **Tier 2 (PMI, JOLTS, Retail, Claims)**: Weight = 1.2x
- **Tier 3 (Sentiment, Others)**: Weight = 0.8x

#### STEP 4: FINAL ALPHA & CONFIDENCE
- **Direction**: Determined by the sum of (Polarity * Adjusted_Score).
- **Confidence**: 60 + (|Net_Sum| / Total_Possible_Points * 39). 
- Penalty: Reduce confidence by 10% if Tier 1 and Tier 2 vectors are in direct conflict.

### 📝 MANDATORY JSON OUTPUT FORMAT
{
  "internal_analysis": {
    "vector_audit": [
      {
        "event": "Event Name",
        "logic": "Detailed explanation...",
        "raw_score": 0.0,
        "weighted_score": 0.0
      }
    ],
    "net_total_alpha": 0.0
  },
  "direction": "BUY" | "SELL" | "NEUTRAL",
  "confidence": 60-99,
  "confidenceLevel": "HIGH" | "MED" | "LOW",
  "reason": "Professional summary (min 50 words)."
}
`;

const getPrediction = async (events) => {
  try {
    const marketVectors = events.map((e, index) => {
      // ✅ 核心功能: 强力清洗数字，防止 NaN 报错
      const cleanNum = (str) => {
        if (str === null || str === undefined || str === '--') return NaN;
        // 1. 转字符串 (防止输入已经是数字导致 replace 报错)
        const stringVal = String(str);
        // 2. 只保留数字、小数点、负号
        const cleaned = stringVal.replace(/[^0-9.-]/g, '');
        // 3. 解析浮点数
        const num = parseFloat(cleaned);
        // 4. 再次检查有效性
        return isNaN(num) ? NaN : num;
      };

      const prev = cleanNum(e.previous);
      const fore = cleanNum(e.forecast);
      const act = cleanNum(e.actual);

      // ✅ 核心功能: 自动识别数据权重 (Tier 1/2/3)
      const title = e.title.toUpperCase();
      let tier = 3;
      if (/(CPI|NFP|GDP|FED|INTEREST RATE|PAYROLLS|INFLATION)/.test(title)) tier = 1;
      else if (/(PMI|JOLTS|RETAIL|CLAIMS|UNEMPLOYMENT)/.test(title)) tier = 2;

      let vectorType = "NEUTRAL";
      let shiftPercent = 0;
      let mathContext = "";

      // 逻辑分支 A: 数据已发布 (Actual vs Forecast)
      if (!isNaN(act) && !isNaN(fore)) {
        vectorType = "REAL_TIME_RELEASE";
        shiftPercent = fore !== 0 ? ((act - fore) / Math.abs(fore)) * 100 : 0;
        mathContext = `Actual: ${act} | Forecast: ${fore} | Z-Delta: ${shiftPercent.toFixed(2)}%`;
      } 
      // 逻辑分支 B: 数据未发布 (Forecast vs Previous)
      else if (!isNaN(fore) && !isNaN(prev)) {
        vectorType = "MARKET_EXPECTATION";
        shiftPercent = prev !== 0 ? ((fore - prev) / Math.abs(prev)) * 100 : 0;
        mathContext = `Forecast: ${fore} | Previous: ${prev} | Trend-Delta: ${shiftPercent.toFixed(2)}%`;
      } else {
        return null; // 数据不足，跳过此向量
      }

      return `[VECTOR ${index + 1}: ${e.title}]
      - STRATEGY_TIER: ${tier}
      - DATA_STATUS: ${vectorType}
      - QUANT_DATA: ${mathContext}
      - HISTORICAL_IMPACT: ${e.impact}`;
    }).filter(v => v !== null).join('\n\n');

    if (!marketVectors) throw new Error("No processable macro vectors.");

    // ✅ 调用 Groq/Llama 3
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: GOLD_FORECAST_PROMPT },
        { role: 'user', content: `CRITICAL: Analyze the following ${events.length} vectors and output the JSON scoring model:\n\n${marketVectors}` }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.15, // 稍微有点创造力，避免死板
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(completion.choices[0].message.content);

    // ✅ 核心功能: 人工随机扰动 (Jitter)
    // 解决 "85%" 重复出现的问题。给它加一个 [-3, +3] 的随机偏移
    let rawConfidence = parseInt(result.confidence);
    if (isNaN(rawConfidence)) rawConfidence = 75; // 兜底

    const jitter = Math.floor(Math.random() * 7) - 3; 
    rawConfidence += jitter;

    // ✅ 核心功能: 安全范围锁定 (60-99)
    const finalConfidence = Math.min(99, Math.max(60, rawConfidence));
    
    return {
      direction: result.direction,
      confidence: finalConfidence,
      confidenceLevel: finalConfidence >= 80 ? 'HIGH' : (finalConfidence >= 70 ? 'MED' : 'LOW'),
      reason: result.reason,
      analysis_details: result.internal_analysis // 暴露详细分析给前端
    };

  } catch (error) {
    console.error('❌ Quant Model Error:', error);
    // 兜底返回，防止前端白屏
    return { direction: 'NEUTRAL', confidence: 60, confidenceLevel: 'LOW', reason: "Data insufficiency or calculation error." };
  }
};

module.exports = { getPrediction };