const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  symbol: { type: String, required: true },
  action: { type: String, enum: ['buy', 'sell'], required: true },
  quantity: { type: Number, required: true },
  price: { type: Number, required: true },
  total: { type: Number, required: true },
  date: { type: Date, default: Date.now },
});

const portfolioSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  avatar: { type: String },
  transactions: [transactionSchema], // Array of subdocuments
});

module.exports = mongoose.model('Portfolio', portfolioSchema);
