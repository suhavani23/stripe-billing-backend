const express = require('express');
const Stripe = require('stripe');

const Customer = require('../models/Customer');
const Subscription = require('../models/Subscription');
const ProcessedEvent = require('../models/ProcessedEvent');

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * POST /webhooks/stripe
 *
 * IMPORTANT: this route must receive the RAW request body (not JSON-parsed)
 * because Stripe's signature check is computed over the exact raw bytes.
 * That's why express.raw() is applied only to this route in server.js,
 * before the global express.json() middleware runs.
 */
router.post('/webhooks/stripe', async (req, res) => {
  const signature = req.headers['stripe-signature'];

  let event;
  try {
    // constructEvent throws if the signature doesn't match — this is what
    // stops anyone who isn't Stripe from POSTing fake events to us and
    // triggering fake "payment succeeded" state changes.
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('[webhook] signature verification failed:', err.message);
    return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
  }

  // --- Idempotent event processing ---------------------------------------
  // Stripe delivers webhooks at-least-once: the same event.id can arrive
  // more than once (e.g. our server was slow to ack, or a network blip made
  // Stripe think delivery failed). If we already recorded this event.id,
  // skip reprocessing so we never double-apply a state change.
  const alreadyProcessed = await ProcessedEvent.findOne({ stripeEventId: event.id });
  if (alreadyProcessed) {
    console.log(`[webhook] duplicate delivery of ${event.id} (${event.type}), skipping`);
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
        // We don't need to handle every event type Stripe can send us —
        // acknowledging with 200 for unhandled types is correct and
        // prevents Stripe from retrying events we intentionally ignore.
        console.log(`[webhook] unhandled event type: ${event.type}`);
    }

    // Only mark as processed AFTER our handler succeeds. If the handler
    // throws, we fall through to the catch block below, respond with a
    // non-2xx, and Stripe will retry delivery — which is what we want,
    // since we have NOT recorded it as processed yet.
    await ProcessedEvent.create({ stripeEventId: event.id, type: event.type });

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error(`[webhook] handler failed for ${event.type} (${event.id}):`, err.message);
    // Returning 5xx tells Stripe to retry this event later — intentional,
    // since we did not persist ProcessedEvent for it.
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
});

async function handleCheckoutCompleted(event) {
  const session = event.data.object;

  await Customer.findOneAndUpdate(
    { stripeCustomerId: session.customer },
    { stripeCustomerId: session.customer, email: session.customer_details?.email },
    { upsert: true, new: true }
  );

  if (session.subscription) {
    const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
    const sub = await stripeClient.subscriptions.retrieve(session.subscription);

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

  console.log(`[webhook] checkout completed for customer ${session.customer}`);
}

async function handlePaymentFailed(event) {
  const invoice = event.data.object;
  const subscriptionId = invoice.subscription;

  if (!subscriptionId) return;

  // Mark it past_due rather than silently dropping the event — a
  // subscription with a failed payment is a real business state that
  // downstream code (e.g. access control) needs to see.
  await Subscription.findOneAndUpdate(
    { stripeSubscriptionId: subscriptionId },
    { status: 'past_due' }
  );

  console.warn(`[webhook] payment failed for subscription ${subscriptionId}`);
}

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

  console.log(`[webhook] subscription canceled: ${sub.id}`);
}

module.exports = router;
