import React from 'react';

const DisclaimerModal = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative">
        
        {/* 关闭按钮 */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
        >
          ✕
        </button>

        <h2 className="text-xl font-bold text-eagle-gold mb-4 uppercase tracking-widest">
          Legal Disclaimer
        </h2>

        <div className="text-gray-300 text-sm space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
          <p className="font-bold text-white">1. General Information Only</p>
          <p>
            The content provided by Eagle.AI is for informational and educational purposes only. 
            It is not intended as financial or investment advice.
          </p>

          <p className="font-bold text-white">2. High Risk Warning</p>
          <p>
            Trading financial markets involves a high level of risk and may not be suitable for all investors. 
            You could lose some or all of your initial investment. Do not trade with money you cannot afford to lose.
          </p>

          <p className="font-bold text-white">3. Third-Party Data</p>
          <p>
            Market data and news events are aggregated from various third-party sources. 
            Eagle.AI does not guarantee the accuracy, timeliness, or completeness of this data.
            Delays in data transmission may occur.
          </p>

          <p className="font-bold text-white">4. Limitation of Liability</p>
          <p>
            By using this app, you agree that Eagle.AI and its developers are not liable for any financial losses 
            incurred while trading based on the information provided here.
          </p>
        </div>

        <div className="mt-6 flex justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-bold transition-all"
          >
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
};

export default DisclaimerModal;