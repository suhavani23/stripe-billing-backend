const express = require('express');
const stripe = require('../stripe');
const ProcessedEvent = require('../models/ProcessedEvent');
const { handleCheckoutCompleted } = require('../handlers/checkout');
const { handlePaymentFailed } = require('../handlers/payment');
const { handleSubscriptionUpdated, handleSubscriptionDeleted } = require('../handlers/subscription');

const router = express.Router();

router.post('/webhooks/stripe', async (req, res) => {
  const signature = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('webhook signature check failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // skip duplicate deliveries — Stripe guarantees at-least-once, not exactly-once
  const already = await ProcessedEvent.findOne({ stripeEventId: event.id });
  if (already) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(event);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event);
        break;
      default:
        console.log(`unhandled webhook event: ${event.type}`);
    }

    // record only after the handler succeeds — if it threw, Stripe retries
    await ProcessedEvent.create({ stripeEventId: event.id, type: event.type });
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error(`webhook handler error for ${event.type}:`, err.message);
    return res.status(500).json({ error: 'handler failed' });
  }
});

module.exports = router;
