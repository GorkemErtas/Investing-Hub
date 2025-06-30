// backend/models/Log.js
const mongoose = require('mongoose');
const LogSchema = new mongoose.Schema({
  level:   { type: String, default: 'info' },
  message: String,
  meta:    mongoose.Schema.Types.Mixed,
  timestamp: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Log', LogSchema, 'logs');