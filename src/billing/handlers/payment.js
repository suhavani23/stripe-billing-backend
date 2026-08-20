const Subscription = require('../models/Subscription');

async function handlePaymentFailed(event) {
  const invoice = event.data.object;
  if (!invoice.subscription) return;

  await Subscription.findOneAndUpdate(
    { stripeSubscriptionId: invoice.subscription },
    { status: 'past_due' }
  );

  console.warn(`payment failed for subscription ${invoice.subscription}`);
}

module.exports = { handlePaymentFailed };
