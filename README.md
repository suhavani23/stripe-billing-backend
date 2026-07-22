# Stripe Billing Backend

A small subscription billing backend built on Stripe's Checkout, Payment,
and Webhooks APIs — with a specific focus on the parts of "integrating a
payment API" that are easy to skip and easy to get wrong: idempotent
requests, signature verification, and handling duplicate/out-of-order
webhook delivery.

## Stack

Node.js, Express, MongoDB (Mongoose), Stripe SDK, Jest.

## Setup

1. `npm install`
2. `cp .env.example .env` and fill in your **test-mode** Stripe keys from
   the [Stripe Dashboard](https://dashboard.stripe.com/test/apikeys).
3. Create a test Product + Price in the Dashboard, put the Price ID in
   `.env` as `STRIPE_PRICE_ID`.
4. Have MongoDB running locally (or point `MONGO_URI` at Atlas).
5. In one terminal: `npm run dev`
6. In another terminal, forward webhooks to your local server:
   ```
   stripe listen --forward-to localhost:3000/webhooks/stripe
   ```
   Copy the `whsec_...` secret it prints into `.env` as
   `STRIPE_WEBHOOK_SECRET`.
7. Trigger a checkout: `POST /checkout` with `{ "email": "you@example.com" }`,
   open the returned `url`, and pay with Stripe's test card
   `4242 4242 4242 4242` (any future expiry, any CVC).
8. To test failure handling, use a declining test card such as
   `4000 0000 0000 0002`, or trigger events directly:
   ```
   stripe trigger invoice.payment_failed
   ```

## Run tests

```
npm test
```

## Design decisions

**Why idempotency keys on `/checkout`?**
A client (mobile app, flaky network, impatient user double-clicking) can
retry the same request. Without an idempotency key, that creates two
separate Checkout Sessions — in a real product, potentially two charges.
Stripe's SDK accepts an `idempotencyKey` per-request specifically to make
retries safe: same key + same params → same session returned, no
duplicate created. See `src/routes/checkout.js`.

**Why verify webhook signatures?**
The `/webhooks/stripe` endpoint is a public URL. Without signature
verification, anyone could POST a fake `checkout.session.completed` event
and trick the server into marking an unpaid subscription as active.
`stripe.webhooks.constructEvent()` verifies the payload was actually sent
by Stripe using the shared webhook signing secret. This requires the
**raw** request body (not JSON-parsed) — see the middleware ordering note
in `src/server.js`.

**Why track processed event IDs?**
Stripe documents webhook delivery as *at-least-once*, not exactly-once —
the same `event.id` can be delivered more than once (e.g. if our server is
slow to respond and Stripe's retry kicks in before our first response
lands). If we don't guard against this, a duplicate delivery of
`customer.subscription.deleted` could, for example, redundantly fire
downstream side effects. `ProcessedEvent` records handled event IDs so
duplicate deliveries are recognized and skipped. See
`src/routes/webhooks.js`.

**Why mark `ProcessedEvent` only after the handler succeeds?**
If the handler throws mid-way, we intentionally respond with a 5xx and do
**not** record the event as processed. Stripe interprets any non-2xx
response as "delivery failed" and will retry — which is exactly what we
want, since our local state update didn't actually complete. Marking the
event as processed *before* running the handler would risk silently
dropping an event if the handler fails.

**Why branch on `err.type` for Stripe API errors in `/checkout`?**
Stripe's errors are typed (`StripeInvalidRequestError`,
`StripeAPIError`, `StripeConnectionError`, etc.). Treating every failure
as a generic 500 loses information the client actually needs — e.g. a
`StripeConnectionError` is transient and safe to retry (with the same
idempotency key), whereas a `StripeInvalidRequestError` means the request
itself is wrong and retrying won't help.

## What this project deliberately does NOT include

No frontend, no deployment config, no production auth layer. The scope is
narrowly the payment-integration reliability patterns above — retries,
idempotency, signature verification, duplicate-event handling — since
that's the part most tutorials skip and the part that actually matters in
a real payments integration.
