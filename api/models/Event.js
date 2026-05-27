const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema({
  symbol: { type: String, required: true },
  date: { type: String, required: true }, // Format: YYYY-MM-DD
  text: { type: String, required: true },
  color: { type: String, default: '#ffffff' },
  textColor: { type: String, default: '#ffffff' },
  shape: { type: String, default: 'arrowUp' },
  position: { type: String, default: 'belowBar' },
  source: { type: String }, // e.g., 'x.com'
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Event || mongoose.model('Event', EventSchema);
