import express from 'express';
import { sendOtp, verifyOtp } from '../controller/otpController.js';


const otpRouter = express.Router();


otpRouter.post('/send', sendOtp);
otpRouter.post('/verify', verifyOtp);

export default otpRouter;