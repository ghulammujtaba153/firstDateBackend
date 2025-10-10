import express from 'express';
import authRouter from "./authRoutes.js"
import otpRouter from './otpRoutes.js';
import userDashboardRouter from './userDashboardRoutes.js';

const router = express.Router();


router.use('/auth', authRouter);
router.use('/otp', otpRouter);
router.use("/user-dashboard", userDashboardRouter)


export default router;

