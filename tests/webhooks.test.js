/**
 * Verifies that if the same Stripe event.id is delivered twice (which
 * Stripe's own docs say WILL happen under at-least-once delivery), our
 * handler processes it once and short-circuits the second delivery.
 *
 * Mongoose models and the Stripe SDK are both mocked so this runs without
 * a real database or network connection.
 */

const mockEvent = {
  id: 'evt_test_123',
  type: 'customer.subscription.deleted',
  data: { object: { id: 'sub_test_123' } },
};

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    webhooks: {
      constructEvent: jest.fn(() => mockEvent),
    },
  }));
});

const mockProcessedStore = new Set();

jest.mock('../src/models/ProcessedEvent', () => ({
  findOne: jest.fn(({ stripeEventId }) =>
    Promise.resolve(mockProcessedStore.has(stripeEventId) ? { stripeEventId } : null)
  ),
  create: jest.fn(({ stripeEventId }) => {
    mockProcessedStore.add(stripeEventId);
    return Promise.resolve({ stripeEventId });
  }),
}));

jest.mock('../src/models/Subscription', () => ({
  findOneAndUpdate: jest.fn(() => Promise.resolve({})),
}));

jest.mock('../src/models/Customer', () => ({
  findOneAndUpdate: jest.fn(() => Promise.resolve({})),
}));

process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy';

const express = require('express');
const request = require('supertest');
const webhooksRouter = require('../src/routes/webhooks');
const Subscription = require('../src/models/Subscription');

function buildApp() {
  const app = express();
  app.use('/webhooks/stripe', express.raw({ type: 'application/json' }));
  app.use(webhooksRouter);
  return app;
}

describe('POST /webhooks/stripe deduplication', () => {
  beforeEach(() => {
    mockProcessedStore.clear();
    jest.clearAllMocks();
  });

  it('processes a new event once', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/webhooks/stripe')
      .set('stripe-signature', 'dummy')
      .send(Buffer.from('{}'));

    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBeUndefined();
    expect(Subscription.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('skips reprocessing on duplicate delivery of the same event.id', async () => {
    const app = buildApp();

    await request(app)
      .post('/webhooks/stripe')
      .set('stripe-signature', 'dummy')
      .send(Buffer.from('{}'));

    const secondRes = await request(app)
      .post('/webhooks/stripe')
      .set('stripe-signature', 'dummy')
      .send(Buffer.from('{}'));

    expect(secondRes.status).toBe(200);
    expect(secondRes.body.duplicate).toBe(true);
    // Handler logic (subscription update) should NOT run again on the
    // duplicate delivery.
    expect(Subscription.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });
});
