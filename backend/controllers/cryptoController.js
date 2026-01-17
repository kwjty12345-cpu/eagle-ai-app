// backend/controllers/cryptoController.js
const axios = require('axios');
const crypto = require('crypto');
const User = require('../models/User');

// @desc    1. 创建支付订单
// @route   POST /api/crypto/create
const createCryptoPayment = async (req, res) => {
  try {
    const { plan } = req.body;
    const user = req.user;

    // 1. 设置价格
    const price = plan === 'elite' ? 59.99 : 29.00;

    // 2. 准备数据
    const payload = {
      price_amount: price,
      price_currency: 'usd',
      pay_currency: 'usdttrc20',
      ipn_callback_url: `${process.env.API_URL}/api/crypto/webhook`,
      order_id: user._id.toString(),
      order_description: `Eagle AI ${plan} Plan`
    };

    // 3. 调用 NowPayments API
    const response = await axios.post('https://api.nowpayments.io/v1/invoice', payload, {
      headers: {
        'x-api-key': process.env.NOWPAYMENTS_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    res.json({ url: response.data.invoice_url });

  } catch (error) {
    console.error('Create Crypto Error:', error.response?.data || error.message);
    res.status(500).json({ message: '创建订单失败' });
  }
};

// @desc    2. 接收付款通知 (Webhook)
// @route   POST /api/crypto/webhook
const handleWebhook = async (req, res) => {
  try {
    // 👇 --- 为了测试，安检代码已暂时注释 ---
    /*
    const sig = req.headers['x-nowpayments-sig'];
    if (!sig) return res.status(400).send('No signature');

    const hmac = crypto.createHmac('sha512', process.env.NOWPAYMENTS_IPN_SECRET);
    hmac.update(JSON.stringify(req.body, Object.keys(req.body).sort().join('')));
    const signature = hmac.digest('hex');

    if (signature !== sig) {
      return res.status(400).send('Invalid signature');
    }
    */
    // 👆 --- 安检代码结束 ---

    // 直接处理业务逻辑
    const { payment_status, order_id, pay_amount } = req.body;
    
    // 只要发过来是 finished，就升级
    if (payment_status === 'finished') {
      console.log(`✅ 测试模式: 收到到账通知! 用户ID: ${order_id}`);

      let plan = 'free';
      const amount = parseFloat(pay_amount);
      
      // 这里的金额判断逻辑保持不变
      if (amount > 50) plan = 'elite';
      else if (amount > 20) plan = 'pro';

      // 修改数据库
      await User.findByIdAndUpdate(order_id, {
        subscriptionStatus: 'active',
        subscriptionPlan: plan,
        subscriptionEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      });
    }

    res.status(200).send('OK');

  } catch (error) {
    console.error('Webhook Error:', error);
    res.status(500).send('Server Error');
  }
};

// 确保导出两个函数
module.exports = { createCryptoPayment, handleWebhook };