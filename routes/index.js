import express from 'express';
import authRouter from "./authRoutes.js"
import otpRouter from './otpRoutes.js';
import userDashboardRouter from './userDashboardRoutes.js';
import notificationRouter from './notificationRoutes.js';
import eventRouter from './eventRoutes.js';
import eventFeedbackRouter from './eventFeedbackRoutes.js';
import complainRouter from './complainRoutes.js';
import subscriptionRouter from './subscriptionRoutes.js';
import userSubscriptionRouter from './userSubscriptionRoutes.js';
import chatRoomRouter from './chatRoomRoutes.js';
import likeRouter from './likeRoutes.js';
import uploadRouter from './uploadRoutes.js';
import diditRouter from './diditRoutes.js';

const router = express.Router();


router.use('/auth', authRouter);
router.use('/otp', otpRouter);
router.use("/user-dashboard", userDashboardRouter)
router.use("/notification", notificationRouter);
router.use("/events", eventRouter);
router.use("/event-feedback", eventFeedbackRouter);
router.use("/complains", complainRouter)
router.use("/subscriptions", subscriptionRouter)
router.use("/user-subscriptions", userSubscriptionRouter)
router.use("/chat", chatRoomRouter)
router.use("/likes", likeRouter)
router.use("/upload", uploadRouter)
router.use("/", diditRouter)

export default router;

