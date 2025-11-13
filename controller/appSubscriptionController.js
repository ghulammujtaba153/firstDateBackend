import Stripe from 'stripe';
import User from '../models/user.js';
import Subscription from '../models/subscriptionModel.js';
import mongoose from 'mongoose';
import { isDBConnected } from '../database/db.js';

// Initialize Stripe
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  console.warn('⚠️  STRIPE_SECRET_KEY is not set in environment variables. Subscription functionality will not work.');
}
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

// Subscription plans configuration
const SUBSCRIPTION_PLANS = {
  basic: {
    name: 'Basic Plan',
    price: 9.99,
    priceId: process.env.STRIPE_BASIC_PRICE_ID, // Set in .env
    duration: 30, // days
  },
  premium: {
    name: 'Premium Plan',
    price: 19.99,
    priceId: process.env.STRIPE_PREMIUM_PRICE_ID, // Set in .env
    duration: 30, // days
  },
  ultimate: {
    name: 'Ultimate Plan',
    price: 29.99,
    priceId: process.env.STRIPE_ULTIMATE_PRICE_ID, // Set in .env
    duration: 30, // days
  },
};

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

    const plan = SUBSCRIPTION_PLANS[planId];
    if (!plan) {
      return res.status(400).json({ error: "Invalid plan ID" });
    }

    // Validate or create Stripe price ID
    let priceId = plan.priceId;
    if (!priceId) {
      // Create price dynamically if not configured
      try {
        // First, check if a product exists for this plan
        const productName = `First Date - ${plan.name}`;
        let products = await stripe.products.list({ limit: 100 });
        let product = products.data.find(p => p.name === productName);

        if (!product) {
          // Create product if it doesn't exist
          product = await stripe.products.create({
            name: productName,
            description: `${plan.name} subscription`,
          });
        }

        // Create price for the product
        const price = await stripe.prices.create({
          product: product.id,
          unit_amount: Math.round(plan.price * 100), // Convert to cents
          currency: 'usd',
          recurring: {
            interval: 'month',
          },
        });

        priceId = price.id;
        console.log(`Created Stripe price for ${plan.name}: ${priceId}`);
      } catch (priceError) {
        console.error('Error creating Stripe price:', priceError);
        return res.status(500).json({ 
          error: "Failed to create subscription price. Please configure STRIPE_BASIC_PRICE_ID, STRIPE_PREMIUM_PRICE_ID, and STRIPE_ULTIMATE_PRICE_ID in your environment variables." 
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
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard/subscriptions?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard/subscriptions?canceled=true`,
      metadata: {
        userId: userId.toString(),
        planId: planId,
        planName: plan.name,
      },
      subscription_data: {
        metadata: {
          userId: userId.toString(),
          planId: planId,
          planName: plan.name,
        },
      },
    });

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

    // Get subscription from Stripe
    const subscriptionId = typeof session.subscription === 'string' 
      ? session.subscription 
      : session.subscription?.id;

    if (!subscriptionId) {
      console.error('No subscription ID in checkout session');
      throw new Error('No subscription ID found in checkout session');
    }

    console.log('Retrieving subscription from Stripe:', subscriptionId);
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const plan = SUBSCRIPTION_PLANS[planId];

    if (!plan) {
      console.error('Plan not found:', planId);
      throw new Error(`Plan ${planId} not found`);
    }

    console.log('Subscription retrieved:', {
      id: subscription.id,
      status: subscription.status,
      current_period_start: subscription.current_period_start,
      current_period_end: subscription.current_period_end,
      customer: subscription.customer,
    });

    // Update user premium status
    const user = await User.findById(userId);
    if (!user) {
      console.error('User not found:', userId);
      throw new Error(`User ${userId} not found`);
    }

    // Safely convert Stripe timestamps to Date objects
    // Stripe timestamps are Unix timestamps in seconds
    let currentPeriodStart;
    let currentPeriodEnd;

    if (subscription.current_period_start) {
      // Handle both number (Unix timestamp) and Date object
      if (typeof subscription.current_period_start === 'number') {
        currentPeriodStart = new Date(subscription.current_period_start * 1000);
      } else if (subscription.current_period_start instanceof Date) {
        currentPeriodStart = subscription.current_period_start;
      } else {
        // Try to parse as string or use current date
        currentPeriodStart = new Date();
      }
    } else {
      currentPeriodStart = new Date();
    }

    if (subscription.current_period_end) {
      // Handle both number (Unix timestamp) and Date object
      if (typeof subscription.current_period_end === 'number') {
        currentPeriodEnd = new Date(subscription.current_period_end * 1000);
      } else if (subscription.current_period_end instanceof Date) {
        currentPeriodEnd = subscription.current_period_end;
      } else {
        // Calculate end date from start date + plan duration
        currentPeriodEnd = new Date(currentPeriodStart);
        currentPeriodEnd.setDate(currentPeriodEnd.getDate() + plan.duration);
      }
    } else {
      // Calculate end date from start date + plan duration
      currentPeriodEnd = new Date(currentPeriodStart);
      currentPeriodEnd.setDate(currentPeriodEnd.getDate() + plan.duration);
    }

    // Validate dates
    if (isNaN(currentPeriodStart.getTime())) {
      console.error('Invalid currentPeriodStart date:', subscription.current_period_start);
      currentPeriodStart = new Date(); // Fallback to current date
    }
    if (isNaN(currentPeriodEnd.getTime())) {
      console.error('Invalid currentPeriodEnd date:', subscription.current_period_end);
      currentPeriodEnd = new Date();
      currentPeriodEnd.setDate(currentPeriodEnd.getDate() + plan.duration);
    }

    // Set premium until to the period end date
    const premiumUntil = new Date(currentPeriodEnd);
    
    user.isPremium = true;
    user.premiumUntil = premiumUntil;
    await user.save();
    console.log(`✅ User ${userId} premium status updated until ${premiumUntil.toISOString()}`);

    // Final validation - ensure dates are valid Date objects
    // Only include dates if they are valid
    const subscriptionData = {
      userId,
      planId,
      planName: planName || plan.name,
      price: plan.price,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: typeof subscription.customer === 'string' 
        ? subscription.customer 
        : subscription.customer?.id,
      stripePriceId: subscription.items.data[0]?.price?.id,
      status: subscription.status || 'active',
      cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
    };

    // Only add dates if they are valid
    if (currentPeriodStart instanceof Date && !isNaN(currentPeriodStart.getTime())) {
      subscriptionData.currentPeriodStart = currentPeriodStart;
    } else {
      console.warn('Skipping invalid currentPeriodStart, will use model default');
    }

    if (currentPeriodEnd instanceof Date && !isNaN(currentPeriodEnd.getTime())) {
      subscriptionData.currentPeriodEnd = currentPeriodEnd;
    } else {
      console.warn('Skipping invalid currentPeriodEnd, will use model default');
    }

    console.log('Creating/updating subscription:', {
      userId: subscriptionData.userId.toString(),
      planId: subscriptionData.planId,
      planName: subscriptionData.planName,
      price: subscriptionData.price,
      status: subscriptionData.status,
      currentPeriodStart: subscriptionData.currentPeriodStart.toISOString(),
      currentPeriodEnd: subscriptionData.currentPeriodEnd.toISOString(),
    });

    const savedSubscription = await Subscription.findOneAndUpdate(
      { stripeSubscriptionId: subscriptionId },
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
    throw error; // Re-throw so caller can handle it
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
    const plan = planId ? SUBSCRIPTION_PLANS[planId] : null;

    // Update subscription record
    await Subscription.findOneAndUpdate(
      { stripeSubscriptionId: subscription.id },
      {
        status: subscription.status,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        ...(plan && { planId, planName: plan.name, price: plan.price }),
      },
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
        status: subscription.status, // Will be 'past_due' or 'unpaid'
      }
    );

    // Optionally update user premium status
    // You might want to keep premium active for a grace period
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
    if (session.subscription) {
      const subscriptionId = typeof session.subscription === 'string' 
        ? session.subscription 
        : session.subscription.id;

      const existingSubscription = await Subscription.findOne({
        stripeSubscriptionId: subscriptionId,
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
        stripeSubscriptionId: subscriptionId,
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
    }

    return res.status(400).json({ 
      error: "No subscription found in checkout session",
      sessionDetails: {
        paymentStatus: session.payment_status,
        mode: session.mode,
      }
    });
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

        // Active subscriptions
        const activeSubscriptions = await Subscription.countDocuments({ 
            status: 'active' 
        });

        // Calculate monthly revenue from active subscriptions
        const activeSubs = await Subscription.find({ status: 'active' });
        const monthlyRevenue = activeSubs.reduce((total, sub) => {
            return total + (sub.price || 0);
        }, 0);

        // Failed payments (past_due or unpaid)
        const failedPayments = await Subscription.countDocuments({
            status: { $in: ['past_due', 'unpaid'] }
        });

        // Total users
        const totalUsers = await User.countDocuments();

        // Calculate conversion rate (users with active subscriptions / total users)
        const conversionRate = totalUsers > 0 
            ? ((activeSubscriptions / totalUsers) * 100).toFixed(1)
            : 0;

        // Get previous month stats for comparison (mock for now)
        // You can enhance this by storing historical data
        const previousMonthActive = Math.floor(activeSubscriptions * 0.92); // Mock: 8% increase
        const previousMonthRevenue = Math.floor(monthlyRevenue * 0.92);
        const previousMonthFailed = Math.max(0, failedPayments - 3);

        const activeChange = activeSubscriptions - previousMonthActive;
        const revenueChange = monthlyRevenue - previousMonthRevenue;
        const failedChange = failedPayments - previousMonthFailed;

        res.status(200).json({
            activeSubscriptions,
            monthlyRevenue: Math.round(monthlyRevenue * 100) / 100, // Round to 2 decimals
            failedPayments,
            conversionRate: parseFloat(conversionRate),
            activeChange,
            revenueChange,
            failedChange,
            activeChangePercent: previousMonthActive > 0 
                ? ((activeChange / previousMonthActive) * 100).toFixed(1)
                : '0',
            revenueChangePercent: previousMonthRevenue > 0
                ? ((revenueChange / previousMonthRevenue) * 100).toFixed(1)
                : '0',
        });
    } catch (error) {
        console.error("Error getting subscription stats:", error);
        res.status(500).json({ error: "Server error" });
    }
}

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

        // Build query
        const query = {};

        // Status filter
        if (statusFilter !== 'all') {
            if (statusFilter === 'Active') {
                query.status = 'active';
            } else if (statusFilter === 'Cancelled') {
                query.status = 'canceled';
            } else if (statusFilter === 'Payment Failed') {
                query.status = { $in: ['past_due', 'unpaid'] };
            }
        }

        // Search filter (by user email or username)
        if (search) {
            // First find users matching search
            const users = await User.find({
                $or: [
                    { email: { $regex: search, $options: 'i' } },
                    { username: { $regex: search, $options: 'i' } },
                ]
            }).select('_id');
            
            const userIds = users.map(u => u._id);
            if (userIds.length === 0) {
                // No users found matching search, return empty result
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
            query.userId = { $in: userIds };
        }

        // Get total count
        const total = await Subscription.countDocuments(query);

        // Get subscriptions with pagination
        const subscriptions = await Subscription.find(query)
            .populate('userId', 'username email avatar')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        // Format subscriptions for admin dashboard
        const formattedSubscriptions = subscriptions.map(sub => {
            const user = sub.userId;
            const userName = user?.username || user?.email?.split('@')[0] || 'Unknown';
            const userEmail = user?.email || 'No email';

            // Format status
            let status = 'Active';
            if (sub.status === 'canceled') {
                status = 'Cancelled';
            } else if (sub.status === 'past_due' || sub.status === 'unpaid') {
                status = 'Payment Failed';
            } else if (sub.status === 'trialing') {
                status = 'Trialing';
            } else {
                status = 'Active';
            }

            // Format plan name
            let planName = sub.planName;
            if (planName === 'Ultimate Plan') {
                planName = 'VIP'; // Match the UI
            }

            // Format amount
            const amount = `$${sub.price?.toFixed(2) || '0.00'}`;

            // Payment method (default to Stripe since that's what we use)
            const paymentMethod = 'Stripe';

            // Next billing date
            const nextBilling = sub.currentPeriodEnd
                ? new Date(sub.currentPeriodEnd).toISOString().split('T')[0]
                : 'N/A';

            // Joined date
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
                stripeSubscriptionId: sub.stripeSubscriptionId,
                cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
                currentPeriodStart: sub.currentPeriodStart,
                currentPeriodEnd: sub.currentPeriodEnd,
            };
        });

        res.status(200).json({
            subscriptions: formattedSubscriptions,
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
}

