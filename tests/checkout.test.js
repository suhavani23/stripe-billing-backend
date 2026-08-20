
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => {
    const createdSessions = new Map();

    return {
      checkout: {
        sessions: {
          create: jest.fn((params, options) => {
            const key = options?.idempotencyKey;

            if (key && createdSessions.has(key)) {
              return Promise.resolve(createdSessions.get(key));
            }

            const session = {
              id: `cs_test_${Math.random().toString(36).slice(2)}`,
              url: 'https://checkout.stripe.com/test-session',
            };

            if (key) createdSessions.set(key, session);
            return Promise.resolve(session);
          }),
        },
      },
    };
  });
});

process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
process.env.STRIPE_PRICE_ID = 'price_dummy';
process.env.CLIENT_SUCCESS_URL = 'http://localhost/success';
process.env.CLIENT_CANCEL_URL = 'http://localhost/cancel';

const express = require('express');
const request = require('supertest');
const checkoutRouter = require('../src/billing/routes/checkout');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(checkoutRouter);
  return app;
}

describe('POST /checkout idempotency', () => {
  it('returns the same session for repeated requests with the same idempotency key', async () => {
    const app = buildApp();
    const payload = { email: 'test@example.com', idempotencyKey: 'fixed-key-123' };

    const first = await request(app).post('/checkout').send(payload);
    const second = await request(app).post('/checkout').send(payload);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.sessionId).toBe(first.body.sessionId);
  });

  it('creates distinct sessions for requests with different idempotency keys', async () => {
    const app = buildApp();

    const first = await request(app)
      .post('/checkout')
      .send({ email: 'a@example.com', idempotencyKey: 'key-a' });
    const second = await request(app)
      .post('/checkout')
      .send({ email: 'b@example.com', idempotencyKey: 'key-b' });

    expect(first.body.sessionId).not.toBe(second.body.sessionId);
  });

  it('rejects requests missing an email', async () => {
    const app = buildApp();
    const res = await request(app).post('/checkout').send({});
    expect(res.status).toBe(400);
  });
});
