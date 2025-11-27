import Stripe from 'stripe';
import User from '../models/user.js';
import Subscription from '../models/subscriptionModel.js';
import Package from '../models/packageModel.js';
import Payment from '../models/paymentModel.js';
import mongoose from 'mongoose';
import { isDBConnected } from '../database/db.js';

// Initialize Stripe
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  console.warn('⚠️  STRIPE_SECRET_KEY is not set in environment variables. Subscription functionality will not work.');
}
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

// Create Stripe Checkout Session for subscription
export const createSubscriptionCheckout = async (req, res) => {
  try {
    // Check database connection
    if (!isDBConnected()) {
      console.error('Database not connected');
      return res.status(503).json({
        error: "Database connection not available. Please try again in a moment."
      });
    }

    if (!stripe) {
      return res.status(500).json({
        error: "Stripe is not configured. Please set STRIPE_SECRET_KEY in environment variables."
      });
    }

    const { userId, planId } = req.body;

    if (!userId || !planId) {
      return res.status(400).json({ error: "userId and planId are required" });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid userId format" });
    }

    if (!mongoose.Types.ObjectId.isValid(planId)) {
      return res.status(400).json({ error: "Invalid planId format" });
    }

    // Fetch package from database
    const plan = await Package.findById(planId);

    if (!plan) {
      return res.status(400).json({ error: "Package not found" });
    }

    if (!plan.active) {
      return res.status(400).json({ error: "This package is not currently available" });
    }

    // Validate or create Stripe price ID
    let priceId = plan.stripePriceId;
    if (!priceId) {
      // Create price dynamically if not configured
      try {
        // First, check if a product exists for this plan
        const productName = `First Date - ${plan.title}`;
        let products = await stripe.products.list({ limit: 100 });
        let product = products.data.find(p => p.name === productName);

        if (!product) {
          // Create product if it doesn't exist
          product = await stripe.products.create({
            name: productName,
            description: plan.description || `${plan.title} subscription`,
          });
        }

        // Determine recurring interval based on package type
        let recurringInterval = 'month';
        if (plan.type === 'yearly') {
          recurringInterval = 'year';
        } else if (plan.type === 'weekly') {
          recurringInterval = 'week';
        }

        // Create price for the product
        const priceConfig = {
          product: product.id,
          unit_amount: Math.round(plan.price * 100), // Convert to cents
          currency: 'usd',
        };

        // Add recurring config only if not one-time
        if (plan.type !== 'one-time') {
          priceConfig.recurring = {
            interval: recurringInterval,
          };
        }

        const price = await stripe.prices.create(priceConfig);

        priceId = price.id;

        // Save the price ID back to the package
        plan.stripePriceId = priceId;
        plan.stripeProductId = product.id;
        await plan.save();

        console.log(`Created Stripe price for ${plan.title}: ${priceId}`);
      } catch (priceError) {
        console.error('Error creating Stripe price:', priceError);
        return res.status(500).json({
          error: "Failed to create subscription price. Please add Stripe Price ID to the package in admin dashboard."
        });
      }
    }

    // Get user with timeout handling
    let user;
    try {
      user = await User.findById(userId).maxTimeMS(5000); // 5 second timeout
    } catch (dbError) {
      console.error('Database query error:', dbError);
      if (dbError.name === 'MongoTimeoutError' || dbError.message.includes('buffering')) {
        return res.status(503).json({
          error: "Database connection timeout. Please check your MongoDB connection and try again."
        });
      }
      throw dbError;
    }
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if user already has an active subscription
    const existingSubscription = await Subscription.findOne({
      userId,
      status: 'active',
    });

    if (existingSubscription) {
      return res.status(400).json({
        error: "You already have an active subscription",
        existingPlan: existingSubscription.planName,
      });
    }

    // Create or retrieve Stripe customer
    let customerId = user.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          userId: userId.toString(),
        },
      });
      customerId = customer.id;

      // Save customer ID to user
      user.stripeCustomerId = customerId;
      await user.save();
    }


    // Create Checkout Session
    const sessionConfig = {
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: plan.type === 'one-time' ? 'payment' : 'subscription',
      success_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard/subscriptions?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard/subscriptions?canceled=true`,
      metadata: {
        userId: userId.toString(),
        planId: planId.toString(),
        planName: plan.title,
      },
    };

    // Add subscription_data only if it's a subscription (not one-time)
    if (plan.type !== 'one-time') {
      sessionConfig.subscription_data = {
        metadata: {
          userId: userId.toString(),
          planId: planId.toString(),
          planName: plan.title,
        },
      };
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    res.status(200).json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error("Error creating subscription checkout:", error);
    res.status(500).json({ error: error.message || "Failed to create checkout session" });
  }
};

// Handle Stripe webhook events
export const handleStripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    if (!webhookSecret) {
      console.warn('⚠️  STRIPE_WEBHOOK_SECRET is not set. Webhook verification will fail.');
      return res.status(400).json({ error: 'Webhook secret not configured' });
    }

    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  try {
    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
};

// Handle checkout session completed
async function handleCheckoutCompleted(session) {
  try {
    const userId = session.metadata?.userId;
    const planId = session.metadata?.planId;
    const planName = session.metadata?.planName;

    console.log('Processing checkout completion:', {
      userId,
      planId,
      planName,
      sessionId: session.id,
    });

    if (!userId || !planId) {
      console.error('Missing metadata in checkout session:', {
        userId: !!userId,
        planId: !!planId,
        metadata: session.metadata,
      });
      throw new Error('Missing userId or planId in session metadata');
    }

    // Fetch package from database
    const plan = await Package.findById(planId);

    if (!plan) {
      console.error('Plan not found:', planId);
      throw new Error(`Plan ${planId} not found`);
    }

    // Get subscription from Stripe (if it's a subscription, not one-time)
    const subscriptionId = typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id;

    if (!subscriptionId && plan.type !== 'one-time') {
      console.error('No subscription ID in checkout session');
      throw new Error('No subscription ID found in checkout session');
    }

    let subscription = null;
    let currentPeriodStart = new Date();
    let currentPeriodEnd = new Date();

    if (subscriptionId) {
      console.log('Retrieving subscription from Stripe:', subscriptionId);
      subscription = await stripe.subscriptions.retrieve(subscriptionId);

      console.log('Subscription retrieved:', {
        id: subscription.id,
        status: subscription.status,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        customer: subscription.customer,
      });

      // Convert Stripe timestamps to Date objects
      if (subscription.current_period_start) {
        currentPeriodStart = new Date(subscription.current_period_start * 1000);
      }

      if (subscription.current_period_end) {
        currentPeriodEnd = new Date(subscription.current_period_end * 1000);
      }
    } else {
      // For one-time payments, calculate period based on package type
      currentPeriodStart = new Date();
      currentPeriodEnd = new Date();

      // Set default duration (30 days for one-time)
      currentPeriodEnd.setDate(currentPeriodEnd.getDate() + 30);
    }

    // Validate dates
    if (isNaN(currentPeriodStart.getTime())) {
      currentPeriodStart = new Date();
    }
    if (isNaN(currentPeriodEnd.getTime())) {
      currentPeriodEnd = new Date();
      currentPeriodEnd.setDate(currentPeriodEnd.getDate() + 30);
    }

    // Update user premium status
    const user = await User.findById(userId);
    if (!user) {
      console.error('User not found:', userId);
      throw new Error(`User ${userId} not found`);
    }

    const premiumUntil = new Date(currentPeriodEnd);
    user.isPremium = true;
    user.premiumUntil = premiumUntil;
    await user.save();
    console.log(`✅ User ${userId} premium status updated until ${premiumUntil.toISOString()}`);

    // Create subscription record
    const subscriptionData = {
      userId,
      planId,
      planName: planName || plan.title,
      price: plan.price,
      stripeSubscriptionId: subscriptionId || `one-time-${session.id}`,
      stripeCustomerId: typeof session.customer === 'string'
        ? session.customer
        : session.customer?.id,
      stripePriceId: subscription?.items?.data[0]?.price?.id || plan.stripePriceId,
      status: subscription?.status || 'active',
      cancelAtPeriodEnd: subscription?.cancel_at_period_end || false,
      currentPeriodStart,
      currentPeriodEnd,
    };

    console.log('Creating/updating subscription:', {
      userId: subscriptionData.userId.toString(),
      planId: subscriptionData.planId,
      planName: subscriptionData.planName,
      price: subscriptionData.price,
      status: subscriptionData.status,
    });

    const savedSubscription = await Subscription.findOneAndUpdate(
      { stripeSubscriptionId: subscriptionData.stripeSubscriptionId },
      subscriptionData,
      { upsert: true, new: true }
    );

    console.log(`✅ Subscription activated for user ${userId}:`, {
      subscriptionId: savedSubscription._id,
      planName: savedSubscription.planName,
      status: savedSubscription.status,
    });

    return savedSubscription;
  } catch (error) {
    console.error('Error handling checkout completed:', error);
    throw error;
  }
}

// Handle subscription updated
async function handleSubscriptionUpdated(subscription) {
  try {
    const userId = subscription.metadata?.userId;
    if (!userId) {
      console.error('Missing userId in subscription metadata');
      return;
    }

    const planId = subscription.metadata?.planId;
    let plan = null;

    if (planId && mongoose.Types.ObjectId.isValid(planId)) {
      plan = await Package.findById(planId);
    }

    // Update subscription record
    const updateData = {
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    };

    if (plan) {
      updateData.planId = planId;
      updateData.planName = plan.title;
      updateData.price = plan.price;
    }

    await Subscription.findOneAndUpdate(
      { stripeSubscriptionId: subscription.id },
      updateData,
      { upsert: true, new: true }
    );

    // Update user premium status based on subscription status
    const user = await User.findById(userId);
    if (user) {
      if (subscription.status === 'active' || subscription.status === 'trialing') {
        const premiumUntil = new Date(subscription.current_period_end * 1000);
        user.isPremium = true;
        user.premiumUntil = premiumUntil;
      } else {
        user.isPremium = false;
        user.premiumUntil = null;
      }
      await user.save();
    }

    console.log(`✅ Subscription updated for user ${userId}: ${subscription.status}`);
  } catch (error) {
    console.error('Error handling subscription updated:', error);
  }
}

// Handle subscription deleted
async function handleSubscriptionDeleted(subscription) {
  try {
    const userId = subscription.metadata?.userId;
    if (!userId) {
      console.error('Missing userId in subscription metadata');
      return;
    }

    // Update subscription record
    await Subscription.findOneAndUpdate(
      { stripeSubscriptionId: subscription.id },
      {
        status: 'canceled',
      }
    );

    // Update user premium status
    const user = await User.findById(userId);
    if (user) {
      user.isPremium = false;
      user.premiumUntil = null;
      await user.save();
    }

    console.log(`✅ Subscription canceled for user ${userId}`);
  } catch (error) {
    console.error('Error handling subscription deleted:', error);
  }
}

// Handle invoice payment succeeded
async function handleInvoicePaymentSucceeded(invoice) {
  try {
    const subscriptionId = invoice.subscription;
    if (!subscriptionId) return;

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const userId = subscription.metadata?.userId;

    if (!userId) return;

    const user = await User.findById(userId);
    if (user) {
      const premiumUntil = new Date(subscription.current_period_end * 1000);
      user.isPremium = true;
      user.premiumUntil = premiumUntil;
      await user.save();
    }

    console.log(`✅ Invoice payment succeeded for user ${userId}`);
  } catch (error) {
    console.error('Error handling invoice payment succeeded:', error);
  }
}

// Handle invoice payment failed
async function handleInvoicePaymentFailed(invoice) {
  try {
    const subscriptionId = invoice.subscription;
    if (!subscriptionId) return;

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const userId = subscription.metadata?.userId;

    if (!userId) return;

    // Update subscription status
    await Subscription.findOneAndUpdate(
      { stripeSubscriptionId: subscriptionId },
      {
        status: subscription.status,
      }
    );

    console.log(`⚠️ Invoice payment failed for user ${userId}`);
  } catch (error) {
    console.error('Error handling invoice payment failed:', error);
  }
}

// Verify checkout session and create subscription (fallback if webhook hasn't fired)
export const verifyCheckoutSession = async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({
        error: "Stripe is not configured."
      });
    }

    if (!isDBConnected()) {
      return res.status(503).json({
        error: "Database connection not available."
      });
    }

    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: "Session ID is required" });
    }

    // Retrieve checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'customer'],
    });

    console.log('Checkout session retrieved:', {
      sessionId,
      paymentStatus: session.payment_status,
      subscription: session.subscription,
      metadata: session.metadata,
    });

    // Check if session is completed
    if (session.payment_status !== 'paid') {
      return res.status(400).json({
        error: "Payment not completed",
        paymentStatus: session.payment_status
      });
    }

    // Check if subscription already exists
    const subscriptionId = typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id;

    const searchId = subscriptionId || `one-time-${sessionId}`;

    const existingSubscription = await Subscription.findOne({
      stripeSubscriptionId: searchId,
    });

    if (existingSubscription) {
      console.log('Subscription already exists:', existingSubscription._id);
      // Update user premium status if needed
      const user = await User.findById(existingSubscription.userId);
      if (user && !user.isPremium) {
        user.isPremium = true;
        if (existingSubscription.currentPeriodEnd) {
          user.premiumUntil = existingSubscription.currentPeriodEnd;
        }
        await user.save();
      }

      return res.status(200).json({
        success: true,
        message: "Subscription already processed",
        subscription: existingSubscription,
      });
    }

    // Process the subscription (same logic as webhook)
    console.log('Processing new subscription for user:', session.metadata?.userId);
    await handleCheckoutCompleted(session);

    // Get the created subscription
    const subscription = await Subscription.findOne({
      stripeSubscriptionId: searchId,
    });

    if (subscription) {
      console.log('✅ Subscription created successfully:', subscription._id);
      return res.status(200).json({
        success: true,
        message: "Subscription verified and activated",
        subscription,
      });
    } else {
      console.error('Subscription not found after processing');
      return res.status(500).json({
        error: "Subscription processed but not found in database"
      });
    }
  } catch (error) {
    console.error("Error verifying checkout session:", error);
    res.status(500).json({ error: error.message || "Failed to verify checkout session" });
  }
};

// Get user's current subscription
export const getUserSubscription = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid userId format" });
    }

    const subscription = await Subscription.findOne({
      userId,
      status: { $in: ['active', 'trialing'] },
    }).sort({ createdAt: -1 });

    const user = await User.findById(userId);

    res.status(200).json({
      hasSubscription: !!subscription,
      isPremium: user?.isPremium || false,
      premiumUntil: user?.premiumUntil || null,
      subscription: subscription || null,
    });
  } catch (error) {
    console.error("Error getting user subscription:", error);
    res.status(500).json({ error: error.message || "Failed to get subscription" });
  }
};

// Cancel subscription
export const cancelSubscription = async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({
        error: "Stripe is not configured."
      });
    }

    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const subscription = await Subscription.findOne({
      userId,
      status: 'active',
    });

    if (!subscription || !subscription.stripeSubscriptionId) {
      return res.status(404).json({ error: "No active subscription found" });
    }

    // Cancel subscription at period end
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    // Update subscription record
    subscription.cancelAtPeriodEnd = true;
    await subscription.save();

    res.status(200).json({
      message: "Subscription will be canceled at the end of the current period",
      cancelAtPeriodEnd: true,
    });
  } catch (error) {
    console.error("Error canceling subscription:", error);
    res.status(500).json({ error: error.message || "Failed to cancel subscription" });
  }
};

// Get subscription statistics for admin dashboard
export const getSubscriptionStats = async (req, res) => {
  try {
    if (!isDBConnected()) {
      return res.status(503).json({
        error: "Database connection not available."
      });
    }

    // App Subscriptions Stats
    const activeSubscriptions = await Subscription.countDocuments({
      status: 'active'
    });

    const activeSubs = await Subscription.find({ status: 'active' });
    const subscriptionRevenue = activeSubs.reduce((total, sub) => {
      return total + (sub.price || 0);
    }, 0);

    const failedPayments = await Subscription.countDocuments({
      status: { $in: ['past_due', 'unpaid'] }
    });

    // Event Payments Stats
    const succeededPayments = await Payment.find({ paymentStatus: 'succeeded' });
    const eventPaymentRevenue = succeededPayments.reduce((total, payment) => {
      return total + (payment.amount || 0);
    }, 0);

    // Total Revenue
    const totalRevenue = subscriptionRevenue + eventPaymentRevenue;

    // Calculate previous month estimates (using 92% as before)
    const previousMonthActive = Math.floor(activeSubscriptions * 0.92);
    const previousMonthSubscriptionRevenue = Math.floor(subscriptionRevenue * 0.92);
    const previousMonthEventRevenue = Math.floor(eventPaymentRevenue * 0.92);
    const previousMonthTotalRevenue = previousMonthSubscriptionRevenue + previousMonthEventRevenue;
    const previousMonthFailed = Math.max(0, failedPayments - 3);

    // Calculate changes
    const activeChange = activeSubscriptions - previousMonthActive;
    const subscriptionRevenueChange = subscriptionRevenue - previousMonthSubscriptionRevenue;
    const eventRevenueChange = eventPaymentRevenue - previousMonthEventRevenue;
    const totalRevenueChange = totalRevenue - previousMonthTotalRevenue;
    const failedChange = failedPayments - previousMonthFailed;

    res.status(200).json({
      activeSubscriptions,
      subscriptionRevenue: Math.round(subscriptionRevenue * 100) / 100,
      eventPaymentRevenue: Math.round(eventPaymentRevenue * 100) / 100,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      failedPayments,
      activeChange,
      subscriptionRevenueChange: Math.round(subscriptionRevenueChange * 100) / 100,
      eventRevenueChange: Math.round(eventRevenueChange * 100) / 100,
      totalRevenueChange: Math.round(totalRevenueChange * 100) / 100,
      failedChange,
      activeChangePercent: previousMonthActive > 0
        ? ((activeChange / previousMonthActive) * 100).toFixed(1)
        : '0',
      subscriptionRevenueChangePercent: previousMonthSubscriptionRevenue > 0
        ? ((subscriptionRevenueChange / previousMonthSubscriptionRevenue) * 100).toFixed(1)
        : '0',
      eventRevenueChangePercent: previousMonthEventRevenue > 0
        ? ((eventRevenueChange / previousMonthEventRevenue) * 100).toFixed(1)
        : '0',
      totalRevenueChangePercent: previousMonthTotalRevenue > 0
        ? ((totalRevenueChange / previousMonthTotalRevenue) * 100).toFixed(1)
        : '0',
    });
  } catch (error) {
    console.error("Error getting subscription stats:", error);
    res.status(500).json({ error: "Server error" });
  }
};

// Get all subscriptions for admin dashboard
export const getAllSubscriptionsForAdmin = async (req, res) => {
  try {
    if (!isDBConnected()) {
      return res.status(503).json({
        error: "Database connection not available."
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const statusFilter = req.query.status || 'all';
    const search = req.query.search || '';

    // Build query for subscriptions
    const subscriptionQuery = {};

    if (statusFilter !== 'all') {
      if (statusFilter === 'Active') {
        subscriptionQuery.status = 'active';
      } else if (statusFilter === 'Cancelled') {
        subscriptionQuery.status = 'canceled';
      } else if (statusFilter === 'Payment Failed') {
        subscriptionQuery.status = { $in: ['past_due', 'unpaid'] };
      }
    }

    // Build query for payments
    const paymentQuery = {};
    if (statusFilter !== 'all') {
      if (statusFilter === 'Active') {
        paymentQuery.paymentStatus = 'succeeded';
      } else if (statusFilter === 'Cancelled') {
        paymentQuery.paymentStatus = 'refunded';
      } else if (statusFilter === 'Payment Failed') {
        paymentQuery.paymentStatus = 'failed';
      }
    }

    // Handle search
    let userIds = [];
    if (search) {
      const users = await User.find({
        $or: [
          { email: { $regex: search, $options: 'i' } },
          { username: { $regex: search, $options: 'i' } },
        ]
      }).select('_id');

      userIds = users.map(u => u._id);
      if (userIds.length === 0) {
        return res.status(200).json({
          subscriptions: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0,
          },
        });
      }
      subscriptionQuery.userId = { $in: userIds };
      paymentQuery.userId = { $in: userIds };
    }

    // Fetch subscriptions
    const subscriptions = await Subscription.find(subscriptionQuery)
      .populate('userId', 'username email avatar')
      .sort({ createdAt: -1 })
      .lean();

    // Fetch payments
    const payments = await Payment.find(paymentQuery)
      .populate('userId', 'username email avatar')
      .populate('eventId', 'title')
      .sort({ createdAt: -1 })
      .lean();

    // Format subscriptions
    const formattedSubscriptions = subscriptions.map(sub => {
      const user = sub.userId;
      const userName = user?.username || user?.email?.split('@')[0] || 'Unknown';
      const userEmail = user?.email || 'No email';

      let status = 'Active';
      if (sub.status === 'canceled') {
        status = 'Cancelled';
      } else if (sub.status === 'past_due' || sub.status === 'unpaid') {
        status = 'Payment Failed';
      } else if (sub.status === 'trialing') {
        status = 'Trialing';
      }

      let planName = sub.planName;
      if (planName === 'Ultimate Plan') {
        planName = 'VIP';
      }

      const amount = `$${sub.price?.toFixed(2) || '0.00'}`;
      const paymentMethod = 'Stripe';
      const nextBilling = sub.currentPeriodEnd
        ? new Date(sub.currentPeriodEnd).toISOString().split('T')[0]
        : 'N/A';
      const joined = sub.createdAt
        ? new Date(sub.createdAt).toISOString().split('T')[0]
        : 'N/A';

      return {
        id: sub._id.toString(),
        userId: sub.userId?._id?.toString() || '',
        user: userName,
        email: userEmail,
        plan: planName,
        status,
        amount,
        method: paymentMethod,
        nextBilling,
        joined,
        type: 'subscription',
        stripeSubscriptionId: sub.stripeSubscriptionId,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        currentPeriodStart: sub.currentPeriodStart,
        currentPeriodEnd: sub.currentPeriodEnd,
      };
    });

    // Format payments
    const formattedPayments = payments.map(payment => {
      const user = payment.userId;
      const userName = user?.username || user?.email?.split('@')[0] || 'Unknown';
      const userEmail = user?.email || 'No email';
      const eventTitle = payment.eventId?.title || 'Unknown Event';

      let status = 'Active';
      if (payment.paymentStatus === 'succeeded') {
        status = 'Active';
      } else if (payment.paymentStatus === 'refunded') {
        status = 'Cancelled';
      } else if (payment.paymentStatus === 'failed') {
        status = 'Payment Failed';
      } else if (payment.paymentStatus === 'pending') {
        status = 'Pending';
      }

      const amount = `$${payment.amount?.toFixed(2) || '0.00'}`;
      const paymentMethod = 'Stripe';
      const joined = payment.createdAt
        ? new Date(payment.createdAt).toISOString().split('T')[0]
        : 'N/A';

      return {
        id: payment._id.toString(),
        userId: payment.userId?._id?.toString() || '',
        user: userName,
        email: userEmail,
        plan: eventTitle,
        status,
        amount,
        method: paymentMethod,
        nextBilling: 'N/A',
        joined,
        type: 'event',
        paymentIntentId: payment.paymentIntentId,
        paymentStatus: payment.paymentStatus,
        eventId: payment.eventId?._id?.toString() || '',
      };
    });

    // Merge and sort all records
    const allRecords = [...formattedSubscriptions, ...formattedPayments].sort((a, b) => {
      return new Date(b.joined) - new Date(a.joined);
    });

    // Apply pagination
    const total = allRecords.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedRecords = allRecords.slice(startIndex, endIndex);

    res.status(200).json({
      subscriptions: paginatedRecords,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error getting subscriptions for admin:", error);
    res.status(500).json({ error: "Server error" });
  }
};
