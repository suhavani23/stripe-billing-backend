const stripe = require('../stripe');
const Customer = require('../models/Customer');
const Subscription = require('../models/Subscription');

async function handleCheckoutCompleted(event) {
  const session = event.data.object;

  await Customer.findOneAndUpdate(
    { stripeCustomerId: session.customer },
    { stripeCustomerId: session.customer, email: session.customer_details?.email },
    { upsert: true, new: true }
  );

  if (session.subscription) {
    const sub = await stripe.subscriptions.retrieve(session.subscription);

    await Subscription.findOneAndUpdate(
      { stripeSubscriptionId: sub.id },
      {
        stripeSubscriptionId: sub.id,
        stripeCustomerId: sub.customer,
        status: sub.status,
        priceId: sub.items.data[0]?.price?.id,
        currentPeriodEnd: new Date(sub.current_period_end * 1000),
      },
      { upsert: true, new: true }
    );
  }

  console.log(`checkout completed for customer ${session.customer}`);
}

module.exports = { handleCheckoutCompleted };
