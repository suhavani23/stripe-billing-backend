const Subscription = require('../models/Subscription');

async function handleSubscriptionUpdated(event) {
  const sub = event.data.object;

  await Subscription.findOneAndUpdate(
    { stripeSubscriptionId: sub.id },
    {
      status: sub.status,
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
    }
  );
}

async function handleSubscriptionDeleted(event) {
  const sub = event.data.object;

  await Subscription.findOneAndUpdate(
    { stripeSubscriptionId: sub.id },
    { status: 'canceled' }
  );

  console.log(`subscription canceled: ${sub.id}`);
}

module.exports = { handleSubscriptionUpdated, handleSubscriptionDeleted };
