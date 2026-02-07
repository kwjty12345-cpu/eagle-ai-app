exports.createPayment = async (req, res) => {
    const { amount, orderId } = req.body;

    // 1. 定义原始对象
    const rawPayload = {
        amount: amount.toString(),
        currency: "USDT",
        order_id: orderId || `ORD-${Date.now()}`,
        url_return: "http://localhost:5173/payment-success",
        url_callback: "https://你的ngrok地址/api/payments/webhook", 
        is_payment_multiple: true,
        lifetime: 3600
    };

    try {
        // 2. 🔥 关键修改：在这里就转成 JSON 字符串，确保“算签名的内容”和“发送的内容”绝对一致
        const jsonPayload = JSON.stringify(rawPayload);

        // 3. 计算签名 (base64 Encode -> MD5)
        // 注意：这里传给 generateSignature 的必须已经是字符串了，或者修改 generateSignature 适配
        const bodyBase64 = Buffer.from(jsonPayload).toString('base64');
        const sign = crypto.createHash('md5').update(bodyBase64 + PAYMENT_API_KEY).digest('hex');

        // 4. 发送请求
        const response = await axios.post('https://api.cryptomus.com/v1/payment', jsonPayload, {
            headers: {
                'merchant': MERCHANT_ID,
                'sign': sign,
                'Content-Type': 'application/json' // 手动发字符串时，最好显式指定这个
            }
        });
        
        res.json({ success: true, url: response.data.result.url });
    } catch (error) {
        console.error("Cryptomus Error:", error.response?.data || error.message);
        res.status(500).json({ success: false, error: "支付创建失败" });
    }
};