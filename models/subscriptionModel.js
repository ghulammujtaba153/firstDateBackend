import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  planId: {
    type: String,
    required: true, // 'basic', 'premium', 'ultimate'
  },
  planName: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
  stripeSubscriptionId: {
    type: String,
    unique: true,
    sparse: true,
  },
  stripeCustomerId: {
    type: String,
  },
  stripePriceId: {
    type: String,
  },
  status: {
    type: String,
    enum: ['active', 'canceled', 'past_due', 'unpaid', 'trialing'],
    default: 'active',
  },
  currentPeriodStart: {
    type: Date,
    default: Date.now,
  },
  currentPeriodEnd: {
    type: Date,
    default: function() {
      const date = new Date();
      date.setDate(date.getDate() + 30); // Default to 30 days
      return date;
    },
  },
  cancelAtPeriodEnd: {
    type: Boolean,
    default: false,
  },
  metadata: {
    type: Map,
    of: String,
  },
}, { timestamps: true });

// Index for faster queries
subscriptionSchema.index({ userId: 1 });
subscriptionSchema.index({ stripeSubscriptionId: 1 });
subscriptionSchema.index({ status: 1 });

const Subscription = mongoose.model("Subscription", subscriptionSchema);

export default Subscription;
