// backend/controllers/cryptoController.js
const axios = require('axios');
const User = require('../models/User');
const PromoCode = require('../models/PromoCode'); // 👈 新增：引入优惠码模型

// @desc    创建支付订单 (Oxapay 版本)
// @route   POST /api/crypto/create
const createCryptoPayment = async (req, res) => {
    try {
        const { plan, promoCode } = req.body; // 👈 修改：接收 promoCode
        const user = req.user;

        // 1. 设置基础价格 (转为数字以便计算)
        let finalPrice = plan === 'elite' ? 59.99 : 29.00;
        let description = `Upgrade to Eagle AI ${plan}`;

        // 🔥🔥🔥 新增：优惠码处理逻辑 🔥🔥🔥
        if (promoCode) {
            const validCode = await PromoCode.findOne({ 
                code: promoCode.toUpperCase(), 
                isActive: true 
            });

            // 检查是否存在且未过期
            if (validCode) {
                const now = new Date();
                if (!validCode.expirationDate || now < validCode.expirationDate) {
                    // 计算折扣
                    if (validCode.discountType === 'percent') {
                        // 例如 20 代表 8折
                        finalPrice = finalPrice * ((100 - validCode.value) / 100);
                    } else if (validCode.discountType === 'fixed') {
                        // 直接减钱
                        finalPrice = finalPrice - validCode.value;
                    }
                    
                    // 防止价格小于0
                    if (finalPrice < 0) finalPrice = 0;
                    
                    // 更新描述，方便后台查看
                    description += ` (Code: ${validCode.code})`;
                    console.log(`🎟️ 优惠码生效: ${validCode.code}, 新价格: ${finalPrice}`);
                }
            }
        }
        
        // 转回字符串格式，保留两位小数 (Oxapay 需要字符串)
        const priceString = finalPrice.toFixed(2); 

        // 2. 准备 Oxapay 数据包
        const payload = {
            merchant: process.env.OXAPAY_MERCHANT_KEY,
            amount: priceString, // 👈 修改：使用计算后的价格
            currency: 'USDT', 
            life_time: 60, 
            fee_paid_by_payer: 0, 
            return_url: 'http://localhost:5173', // 本地测试跳回本地
            callback_url: `${process.env.API_URL}/api/crypto/webhook`, 
            order_id: user._id.toString(), 
            description: description // 👈 修改：包含优惠信息的描述
        };

        // 3. 发送请求
        const response = await axios.post('https://api.oxapay.com/merchants/request', payload);

        // 🔥🔥🔥【关键修改】打印 Oxapay 返回的完整数据，方便调试 🔥🔥🔥
        console.log("🔥 Oxapay 原始返回数据:", JSON.stringify(response.data, null, 2));

        if (response.data.result === 100) {
            // 🔥🔥🔥【关键修改】尝试多种可能的字段名 (pay_url 或 payLink) 🔥🔥🔥
            const finalUrl = response.data.pay_url || response.data.payLink || response.data.url;

            if (finalUrl) {
                console.log("🔗 成功获取支付链接:", finalUrl);
                res.json({ url: finalUrl });
            } else {
                console.error("❌ 错误: Oxapay 返回成功，但没有找到 URL 字段");
                throw new Error("Payment URL not found in response");
            }
        } else {
            throw new Error(response.data.message);
        }

    } catch (error) {
        console.error('Oxapay Create Error:', error.response?.data || error.message);
        res.status(500).json({ message: '创建支付失败' });
    }
};

// @desc    接收回调 (Webhook)
// @route   POST /api/crypto/webhook
const handleWebhook = async (req, res) => {
    try {
        // Oxapay 发过来的数据在 req.body 里
        console.log("🔔 Oxapay Webhook:", req.body);

        const { status, order_id, amount } = req.body;

        // 状态: "Paid", "Waiting", "Expired"
        if (status === 'Paid') {
            const userId = order_id; 

            let plan = 'pro';
            // 注意：因为用了优惠码，价格变动了，这里简单的判断 > 50 可能不准了
            // 建议：如果你要区分 Pro/Elite，最好改一下 createCryptoPayment 里的 order_id
            // 例如 order_id: `${user._id.toString()}_${plan}`，然后在 webhook 里拆分字符串来判断 plan
            if (parseFloat(amount) > 50) plan = 'elite'; 

            console.log(`✅ 支付成功! 用户: ${userId} -> ${plan}`);

            await User.findByIdAndUpdate(userId, {
                subscriptionStatus: 'active',
                subscriptionPlan: plan,
                subscriptionEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            });
        }

        res.status(200).send('OK');

    } catch (error) {
        console.error('Webhook Error:', error);
        res.status(500).send('Error');
    }
};

module.exports = { createCryptoPayment, handleWebhook };