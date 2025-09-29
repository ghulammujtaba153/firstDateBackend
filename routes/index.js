import express from 'express';
import authRouter from "./authRoutes.js"
import otpRouter from './otpRoutes.js';

const router = express.Router();


router.use('/auth', authRouter);
router.use('/otp', otpRouter);


export default router;

