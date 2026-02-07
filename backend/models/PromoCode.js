const mongoose = require('mongoose');

const PromoCodeSchema = new mongoose.Schema({
  code: { 
    type: String, 
    required: true, 
    unique: true, 
    uppercase: true, // 强制大写，比如 "eagle20" 存进去变成 "EAGLE20"
    trim: true 
  },
  discountType: { 
    type: String, 
    enum: ['percent', 'fixed'], // 'percent'是打折(如20% off), 'fixed'是减钱(如减5刀)
    default: 'percent' 
  },
  value: { 
    type: Number, 
    required: true // 如果是percent，填20代表8折；如果是fixed，填5代表减5刀
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  expirationDate: {
    type: Date
  }
});

module.exports = mongoose.model('PromoCode', PromoCodeSchema);