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

    if (!userId || !planId) {
      console.error('Missing metadata in checkout session');
      return;
    }

    // Get subscription from Stripe
    const subscriptionId = session.subscription;
    if (!subscriptionId) {
      console.error('No subscription ID in checkout session');
      return;
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const plan = SUBSCRIPTION_PLANS[planId];

    // Update user premium status
    const user = await User.findById(userId);
    if (user) {
      const premiumUntil = new Date();
      premiumUntil.setDate(premiumUntil.getDate() + plan.duration);
      
      user.isPremium = true;
      user.premiumUntil = premiumUntil;
      await user.save();
    }

    // Create or update subscription record
    await Subscription.findOneAndUpdate(
      { stripeSubscriptionId: subscriptionId },
      {
        userId,
        planId,
        planName: planName || plan.name,
        price: plan.price,
        stripeSubscriptionId: subscriptionId,
        stripeCustomerId: subscription.customer,
        stripePriceId: subscription.items.data[0]?.price?.id,
        status: subscription.status,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      },
      { upsert: true, new: true }
    );

    console.log(`✅ Subscription activated for user ${userId}`);
  } catch (error) {
    console.error('Error handling checkout completed:', error);
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

