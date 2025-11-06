import express from "express";
import { createUserSubscription, deleteUserSubscription, getUserSubscriptionById, getUserSubscriptions, updateUserSubscription } from "../controller/userSubscriptionController.js";

const userSubscriptionRouter = express.Router();

userSubscriptionRouter.post("/create", createUserSubscription);
userSubscriptionRouter.get("/get", getUserSubscriptions);
userSubscriptionRouter.get("/get/:id", getUserSubscriptionById);
userSubscriptionRouter.put("/update/:id", updateUserSubscription);
userSubscriptionRouter.delete("/delete/:id", deleteUserSubscription);

export default userSubscriptionRouter;