const mongoose = require('mongoose');

const STATUSES = ['incomplete', 'active', 'past_due', 'canceled', 'unpaid'];

const subscriptionSchema = new mongoose.Schema(
  {
    stripeSubscriptionId: { type: String, required: true, unique: true, index: true },
    stripeCustomerId: { type: String, required: true, index: true },
    status: { type: String, enum: STATUSES, default: 'incomplete' },
    priceId: { type: String, required: true },
    currentPeriodEnd: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Subscription', subscriptionSchema);
module.exports.STATUSES = STATUSES;
