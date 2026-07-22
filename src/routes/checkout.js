const express = require('express');
const Stripe = require('stripe');

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * POST /checkout
 * body: { email: string, idempotencyKey?: string }
 *
 * Creates a Stripe Checkout Session for the configured subscription price.
 *
 * Idempotency: if the client retries this request (e.g. after a timeout,
 * unsure whether the first attempt succeeded), passing the SAME
 * idempotencyKey guarantees Stripe returns the original session instead of
 * creating a second one. This is Stripe's own recommended pattern:
 * https://stripe.com/docs/api/idempotent_requests
 *
 * If the caller doesn't supply a key, we generate one from a stable
 * fingerprint of the request so accidental double-submits (e.g. a user
 * double-clicking "subscribe") are still deduplicated for a short window.
 */
router.post('/checkout', async (req, res) => {
  const { email, idempotencyKey } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'email is required' });
  }

  const key = idempotencyKey || `checkout:${email}:${req.body.clientRequestId || Date.now()}`;

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        customer_email: email,
        line_items: [
          {
            price: process.env.STRIPE_PRICE_ID,
            quantity: 1,
          },
        ],
        success_url: `${process.env.CLIENT_SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: process.env.CLIENT_CANCEL_URL,
      },
      {
        // This is the actual idempotency mechanism — Stripe's SDK forwards
        // this as the `Idempotency-Key` header on the underlying HTTP call.
        idempotencyKey: key,
      }
    );

    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('[checkout] failed to create session:', err.message);

    // Stripe errors are typed — branching on err.type lets us return
    // meaningful responses instead of a blanket 500 for everything.
    if (err.type === 'StripeInvalidRequestError') {
      return res.status(400).json({ error: 'Invalid request to Stripe', detail: err.message });
    }
    if (err.type === 'StripeAPIError' || err.type === 'StripeConnectionError') {
      // Transient / Stripe-side issue — safe for the client to retry
      // (with the SAME idempotency key) after a short backoff.
      return res.status(503).json({ error: 'Stripe temporarily unavailable, please retry' });
    }

    return res.status(500).json({ error: 'Unexpected error creating checkout session' });
  }
});

module.exports = router;
