import express from 'express';
import { 
  createPaymentIntent, 
  verifyPaymentAndJoinEvent, 
  getPaymentStatus,
  refundPayment 
} from '../controller/paymentController.js';

const paymentRouter = express.Router();

paymentRouter.post("/create-intent", createPaymentIntent);
paymentRouter.post("/verify-and-join", verifyPaymentAndJoinEvent);
paymentRouter.get("/status/:eventId/:userId", getPaymentStatus);
paymentRouter.post("/refund", refundPayment);

export default paymentRouter;

