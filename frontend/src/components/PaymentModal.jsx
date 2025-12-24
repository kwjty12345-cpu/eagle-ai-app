import React from 'react';

const PaymentModal = ({ onClose, onUpgrade }) => {
  const plans = [
    {
      name: 'Weekly Access',
      price: '$9.99',
      period: '/ week',
      features: ['Basic Forex Signals', 'Email Support', 'Daily Updates'],
      color: 'border-slate-600',
      btnColor: 'bg-slate-700 hover:bg-slate-600',
      popular: false
    },
    {
      name: 'Monthly Pro',
      price: '$29.99',
      period: '/ month',
      features: ['High Accuracy Signals', 'Real-time SMS Alerts', 'Priority Support'],
      color: 'border-eagle-accent',
      btnColor: 'bg-eagle-accent hover:bg-indigo-500',
      popular: true // 推荐款
    },
    {
      name: 'Lifetime Elite',
      price: '$199',
      period: '/ once',
      features: ['All VIP Signals', '1-on-1 Strategy Call', 'Private Discord Access'],
      color: 'border-yellow-500',
      btnColor: 'bg-gradient-to-r from-yellow-500 to-amber-600 hover:opacity-90',
      popular: false
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-eagle-bg border border-slate-700 rounded-2xl w-full max-w-4xl p-6 relative shadow-2xl">
        
        {/* 关闭按钮 */}
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>

        <h2 className="text-3xl font-bold text-center text-white mb-2">Upgrade to Eagle VIP</h2>
        <p className="text-center text-slate-400 mb-8">Unlock AI-powered predictions and trade with confidence.</p>

        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((plan, index) => (
            <div key={index} className={`relative bg-eagle-card rounded-xl p-6 border-2 flex flex-col ${plan.color} ${plan.popular ? 'transform md:-translate-y-4 shadow-xl shadow-indigo-500/20' : ''}`}>
              {plan.popular && (
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-eagle-accent text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">Most Popular</div>
              )}
              <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
              <div className="flex items-end gap-1 mb-6">
                <span className="text-3xl font-bold text-white">{plan.price}</span>
                <span className="text-slate-400 text-sm mb-1">{plan.period}</span>
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-center text-slate-300 text-sm">
                    <svg className="w-4 h-4 mr-2 text-eagle-success flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                    {feature}
                  </li>
                ))}
              </ul>
              {/* 点击升级 */}
              <button 
                onClick={onUpgrade}
                className={`w-full py-3 rounded-lg text-white font-bold transition transform active:scale-95 ${plan.btnColor}`}
              >
                Choose Plan
              </button>
            </div>
          ))}
        </div>
        
        <p className="text-center text-slate-500 text-xs mt-8">
          Secure payment via Stripe. Cancel anytime.
        </p>
      </div>
    </div>
  );
};

export default PaymentModal;