import Stripe from 'stripe';
import Payment from '../models/paymentModel.js';
import Event from '../models/eventModel.js';
import mongoose from 'mongoose';

// Initialize Stripe
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  console.warn('⚠️  STRIPE_SECRET_KEY is not set in environment variables. Payment functionality will not work.');
}
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

// 📌 Create payment intent for event
export const createPaymentIntent = async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ message: "Stripe is not configured. Please set STRIPE_SECRET_KEY in environment variables." });
    }

    const { eventId, userId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(eventId) || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid ID format" });
    }

    // Get event details
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Check if user already joined
    if (event.participants.includes(userId)) {
      return res.status(400).json({ message: "User already joined this event" });
    }

    // Check if event is full
    if (event.participants.length >= event.maxSlots) {
      return res.status(400).json({ message: "Event is full" });
    }

    // Check if event is closed or completed
    if (event.status === 'closed' || event.status === 'completed') {
      return res.status(400).json({ message: "Event is closed or completed" });
    }

    // Calculate amount in cents (Stripe uses cents)
    const amountInCents = Math.round((event.price || 0) * 100);

    // If event is free, skip payment
    if (amountInCents === 0) {
      return res.status(200).json({
        clientSecret: null,
        amount: 0,
        requiresPayment: false,
        message: "Free event - no payment required"
      });
    }

    // Check for existing pending payment
    const existingPayment = await Payment.findOne({
      eventId,
      userId,
      paymentStatus: 'pending'
    });

    if (existingPayment) {
      // Retrieve the payment intent
      const paymentIntent = await stripe.paymentIntents.retrieve(existingPayment.paymentIntentId);
      return res.status(200).json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: amountInCents / 100,
        requiresPayment: true
      });
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'usd',
      metadata: {
        eventId: eventId.toString(),
        userId: userId.toString(),
        eventTitle: event.title
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    // Save payment record
    const payment = new Payment({
      eventId,
      userId,
      amount: event.price || 0,
      currency: 'usd',
      paymentIntentId: paymentIntent.id,
      paymentStatus: 'pending',
      metadata: {
        eventTitle: event.title
      }
    });

    await payment.save();

    res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: amountInCents / 100,
      requiresPayment: true
    });
  } catch (error) {
    console.error("Error creating payment intent:", error);
    res.status(400).json({ error: error.message || "Failed to create payment intent" });
  }
};

// 📌 Verify payment and join event
export const verifyPaymentAndJoinEvent = async (req, res) => {
  try {
    const { eventId, userId, paymentIntentId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(eventId) || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid ID format" });
    }

    // If no paymentIntentId and event is free, skip Stripe verification
    if (!paymentIntentId) {
      // This is a free event, proceed with joining
    } else if (!stripe) {
      return res.status(500).json({ message: "Stripe is not configured. Please set STRIPE_SECRET_KEY in environment variables." });
    }

    // Get event
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // If event is free, join directly
    if (event.price === 0 || !paymentIntentId) {
      if (event.participants.includes(userId)) {
        return res.status(400).json({ message: "User already joined" });
      }
      if (event.participants.length >= event.maxSlots) {
        return res.status(400).json({ message: "Event is full" });
      }

      event.participants.push(userId);
      await event.save();

      return res.status(200).json({
        message: "Joined event successfully",
        event,
        paymentRequired: false
      });
    }

    // Verify payment
    const payment = await Payment.findOne({
      eventId,
      userId,
      paymentIntentId
    });

    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    // Retrieve payment intent from Stripe
    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    } catch (stripeError) {
      console.error("Error retrieving payment intent:", stripeError);
      return res.status(400).json({ message: "Failed to retrieve payment intent from Stripe" });
    }

    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({
        message: "Payment not completed",
        paymentStatus: paymentIntent.status
      });
    }

    // Update payment record
    payment.paymentStatus = 'succeeded';
    payment.stripeChargeId = paymentIntent.latest_charge;
    await payment.save();

    // Check if user already joined (race condition check)
    if (event.participants.includes(userId)) {
      return res.status(200).json({
        message: "User already joined",
        event,
        paymentRequired: true
      });
    }

    // Check if event is full
    if (event.participants.length >= event.maxSlots) {
      // Refund the payment
      try {
        if (paymentIntent.latest_charge) {
          const refund = await stripe.refunds.create({
            charge: paymentIntent.latest_charge,
            reason: 'requested_by_customer'
          });
          payment.refundId = refund.id;
          payment.paymentStatus = 'refunded';
          await payment.save();
        }
      } catch (refundError) {
        console.error("Error processing refund:", refundError);
      }

      return res.status(400).json({ message: "Event is full. Payment has been refunded." });
    }

    // Add user to event
    event.participants.push(userId);
    await event.save();

    res.status(200).json({
      message: "Payment verified and joined event successfully",
      event,
      paymentRequired: true,
      payment: {
        amount: payment.amount,
        status: payment.paymentStatus
      }
    });
  } catch (error) {
    console.error("Error verifying payment:", error);
    res.status(400).json({ error: error.message || "Failed to verify payment" });
  }
};

// 📌 Get payment status
export const getPaymentStatus = async (req, res) => {
  try {
    const { eventId, userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(eventId) || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid ID format" });
    }

    const payment = await Payment.findOne({
      eventId,
      userId
    }).sort({ createdAt: -1 });

    if (!payment) {
      return res.status(200).json({
        hasPayment: false,
        paymentStatus: null
      });
    }

    res.status(200).json({
      hasPayment: true,
      paymentStatus: payment.paymentStatus,
      amount: payment.amount,
      paymentIntentId: payment.paymentIntentId,
      createdAt: payment.createdAt
    });
  } catch (error) {
    console.error("Error getting payment status:", error);
    res.status(400).json({ error: error.message || "Failed to get payment status" });
  }
};

// 📌 Refund payment (for leaving event)
export const refundPayment = async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ message: "Stripe is not configured. Please set STRIPE_SECRET_KEY in environment variables." });
    }

    const { eventId, userId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(eventId) || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid ID format" });
    }

    const payment = await Payment.findOne({
      eventId,
      userId,
      paymentStatus: 'succeeded'
    });

    if (!payment) {
      return res.status(404).json({ message: "Payment not found or already refunded" });
    }

    if (!payment.stripeChargeId) {
      return res.status(400).json({ message: "No charge ID found for refund" });
    }

    // Create refund
    const refund = await stripe.refunds.create({
      charge: payment.stripeChargeId,
      reason: 'requested_by_customer'
    });

    // Update payment record
    payment.paymentStatus = 'refunded';
    payment.refundId = refund.id;
    await payment.save();

    res.status(200).json({
      message: "Payment refunded successfully",
      refundId: refund.id,
      amount: refund.amount / 100
    });
  } catch (error) {
    console.error("Error refunding payment:", error);
    res.status(400).json({ error: error.message || "Failed to refund payment" });
  }
};

