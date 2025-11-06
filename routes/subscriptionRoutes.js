import express from 'express';
import { createSubscription, deleteSubscription, getSubscriptionById, getSubscriptions, updateSubscription } from '../controller/subscriptionController.js';


const subscriptionRouter = express.Router();

subscriptionRouter.post("/create", createSubscription)
subscriptionRouter.get("/get", getSubscriptions)
subscriptionRouter.get("/get/:id", getSubscriptionById)
subscriptionRouter.put("/update/:id", updateSubscription)
subscriptionRouter.delete("/delete/:id", deleteSubscription)

export default subscriptionRouter;