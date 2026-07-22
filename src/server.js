require('dotenv').config();
const express = require('express');

const connectDB = require('./db');
const checkoutRouter = require('./routes/checkout');
const webhooksRouter = require('./routes/webhooks');

const app = express();

// IMPORTANT ORDERING:
// The webhook route needs the RAW request body to verify Stripe's
// signature, so it must be mounted with express.raw() BEFORE the global
// express.json() middleware runs (json() would consume/parse the body
// first and break signature verification). All other routes use JSON.
app.use('/webhooks/stripe', express.raw({ type: 'application/json' }));
app.use(webhooksRouter);

app.use(express.json());
app.use(checkoutRouter);

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;

async function start() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`[server] listening on port ${PORT}`);
    console.log('[server] run `stripe listen --forward-to localhost:' + PORT + '/webhooks/stripe` in another terminal');
  });
}

start().catch((err) => {
  console.error('[server] failed to start:', err);
  process.exit(1);
});

module.exports = app;
