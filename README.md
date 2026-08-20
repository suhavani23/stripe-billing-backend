# stripe-billing-backend

Subscription billing backend using Stripe Checkout and Webhooks. Node/Express/MongoDB.

Built as a reusable module — you can drop `src/billing/` into any Express project and wire it up with two lines. See [Integrating into another project](#integrating-into-another-project) below.

> **Interactive Demo:** You can open [`docs/index.html`](docs/index.html) in your browser to explore the API endpoints, checkout flow, and simulate requests without needing live Stripe credentials.

## Stack

Node.js, Express, MongoDB (Mongoose), Stripe SDK, Jest.

## Setup

1. `npm install`
2. `cp .env.example .env` — fill in your test-mode Stripe keys from the [Dashboard](https://dashboard.stripe.com/test/apikeys)
3. Create a Product + Price in the Dashboard, put the Price ID in `.env` as `STRIPE_PRICE_ID`
4. Have MongoDB running locally (or point `MONGO_URI` at Atlas)
5. `npm run dev`
6. In another terminal, forward webhooks locally:
   ```
   stripe listen --forward-to localhost:3000/webhooks/stripe
   ```
   Paste the `whsec_...` secret into `.env` as `STRIPE_WEBHOOK_SECRET`.
7. Test a checkout: `POST /checkout` with `{ "email": "you@example.com" }`, open the returned URL, pay with card `4242 4242 4242 4242`
8. Test a failure: use card `4000 0000 0000 0002`, or trigger events directly:
   ```
   stripe trigger invoice.payment_failed
   ```

## Run tests

```
npm test
```

## Integrating into another project

Copy `src/billing/` into your project. Then just do:

```js
const { mountBilling } = require('./billing');
mountBilling(app);
```

That's it. It registers `/checkout` and `/webhooks/stripe` on your app and handles all the Stripe-specific middleware internally (raw body parsing for signature verification etc).

You'll need these env vars — most you probably already have if you've touched Stripe before:

```
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_ID
CLIENT_SUCCESS_URL
CLIENT_CANCEL_URL
MONGO_URI
```

## A few things worth knowing

Stripe's webhook delivery is at-least-once, meaning the same event can show up more than once if your server is slow to respond. The `ProcessedEvent` model tracks which event IDs we've already handled so we don't double-apply things like subscription cancellations.

The `/checkout` route uses idempotency keys so if a user double-clicks or a mobile client retries after a timeout, they don't end up with two active subscriptions. If the caller doesn't send a key, we build one from the email + request fingerprint.

Webhook signature verification is done on every incoming request — without it anyone could POST a fake `checkout.session.completed` and trick the server into unlocking a paid feature. The raw body is required for this check, which is why the webhook route uses `express.raw()` instead of the global `express.json()`.

Error handling on `/checkout` branches on `err.type` rather than catching everything as a 500. A `StripeConnectionError` is a network hiccup and the client can safely retry with the same key; a `StripeInvalidRequestError` means something's wrong with the request itself and retrying won't help.
