const express = require('express');
const stripe = require('../stripe');

const router = express.Router();

router.post('/checkout', async (req, res) => {
  const { email, idempotencyKey } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'email is required' });
  }

  // fall back to a fingerprint-based key so double-submits get deduplicated
  const key = idempotencyKey || `checkout:${email}:${req.body.clientRequestId || Date.now()}`;

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        customer_email: email,
        line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
        success_url: `${process.env.CLIENT_SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: process.env.CLIENT_CANCEL_URL,
      },
      { idempotencyKey: key }
    );

    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('failed to create checkout session:', err.message);

    if (err.type === 'StripeInvalidRequestError') {
      return res.status(400).json({ error: 'Invalid request to Stripe', detail: err.message });
    }
    if (err.type === 'StripeAPIError' || err.type === 'StripeConnectionError') {
      return res.status(503).json({ error: 'Stripe temporarily unavailable, please retry' });
    }

    return res.status(500).json({ error: 'Unexpected error creating checkout session' });
  }
});

module.exports = router;
