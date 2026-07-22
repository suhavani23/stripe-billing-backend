const mongoose = require('mongoose');

// Stripe explicitly documents that webhook delivery is at-least-once, not
// exactly-once: the same event can arrive more than once (e.g. if your
// endpoint is slow to return a 2xx and Stripe retries). Recording processed
// event IDs here is what makes our webhook handler idempotent.
// https://stripe.com/docs/webhooks#handle-duplicate-events
const processedEventSchema = new mongoose.Schema(
  {
    stripeEventId: { type: String, required: true, unique: true, index: true },
    type: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ProcessedEvent', processedEventSchema);
