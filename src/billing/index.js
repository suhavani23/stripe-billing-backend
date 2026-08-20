const express = require('express');
const checkoutRouter = require('./routes/checkout');
const webhooksRouter = require('./routes/webhooks');

/**
 * Mount all billing routes onto an existing Express app.
 *
 * Usage (in your server.js or app.js):
 *   const { mountBilling } = require('./billing');
 *   mountBilling(app);
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ID,
 *   CLIENT_SUCCESS_URL, CLIENT_CANCEL_URL
 *
 * The webhook route needs the raw request body for Stripe's signature check,
 * so this function handles that middleware internally — don't apply
 * express.json() to /webhooks/stripe yourself.
 */
function mountBilling(app) {
  app.use('/webhooks/stripe', express.raw({ type: 'application/json' }));
  app.use(webhooksRouter);
  app.use(checkoutRouter);
}

module.exports = { mountBilling };
