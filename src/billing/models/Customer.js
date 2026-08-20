const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    stripeCustomerId: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Customer', customerSchema);
