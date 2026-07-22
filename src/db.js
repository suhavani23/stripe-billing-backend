const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI is not set in .env');
  }

  mongoose.connection.on('connected', () => {
    console.log('[db] connected to MongoDB');
  });

  mongoose.connection.on('error', (err) => {
    console.error('[db] connection error:', err.message);
  });

  await mongoose.connect(uri);
}

module.exports = connectDB;
