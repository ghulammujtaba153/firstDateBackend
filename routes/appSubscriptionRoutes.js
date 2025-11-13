import express from 'express';
import { 
  createSubscriptionCheckout,
  getUserSubscription,
  cancelSubscription,
  handleStripeWebhook,
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
appSubscriptionRouter.get('/user/:userId', getUserSubscription);
appSubscriptionRouter.post('/cancel', cancelSubscription);

export default appSubscriptionRouter;

