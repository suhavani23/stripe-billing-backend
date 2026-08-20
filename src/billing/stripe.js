const Stripe = require('stripe');

// single instance — don't re-create this per-request or per-handler
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = stripe;
