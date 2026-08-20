require('dotenv').config();
const express = require('express');

const connectDB = require('./db');
const { mountBilling } = require('./billing');

const app = express();

app.use(express.json());
mountBilling(app);

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;

async function start() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('failed to start:', err);
  process.exit(1);
});

module.exports = app;
