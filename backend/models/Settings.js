const mongoose = require('mongoose');

const SettingsSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  theme: { type: String, enum: ['light', 'dark'], default: 'light' },
  selectedCoins: { type: [String], default: [] },
  priceAlerts: {
  type: Map,
  of: {
    min: { type: Number, default: 0 },
    max: { type: Number, default: Infinity },
  },
  default: {},
},
  notifiedCoins: {
  type: Map,
  of: Boolean,
  default: {},
}
}, { timestamps: true });

module.exports = mongoose.model('Settings', SettingsSchema);
