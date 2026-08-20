const mongoose = require('mongoose');

// Stripe delivers webhooks at-least-once so we track event IDs to skip dupes
const processedEventSchema = new mongoose.Schema(
  {
    stripeEventId: { type: String, required: true, unique: true, index: true },
    type: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ProcessedEvent', processedEventSchema);
