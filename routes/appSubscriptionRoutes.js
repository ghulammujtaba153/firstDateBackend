import express from 'express';
import { 
  createSubscriptionCheckout,
  verifyCheckoutSession,
  getUserSubscription,
  cancelSubscription,
  handleStripeWebhook,
  getSubscriptionStats,
  getAllSubscriptionsForAdmin,
} from '../controller/appSubscriptionController.js';

const appSubscriptionRouter = express.Router();

// Webhook endpoint (must be before other routes to handle raw body)
appSubscriptionRouter.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  handleStripeWebhook
);

// Subscription routes
appSubscriptionRouter.post('/checkout', createSubscriptionCheckout);
appSubscriptionRouter.post('/verify-session', verifyCheckoutSession);
appSubscriptionRouter.get('/user/:userId', getUserSubscription);
appSubscriptionRouter.post('/cancel', cancelSubscription);

// Admin routes
appSubscriptionRouter.get('/admin/stats', getSubscriptionStats);
appSubscriptionRouter.get('/admin/all', getAllSubscriptionsForAdmin);

export default appSubscriptionRouter;

