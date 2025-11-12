import mongoose from "mongoose";

const otpSchema = new mongoose.Schema({
    email: { type: String, required: true },
    code: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: 15*60 } // OTP expires in 15 minutes
});

const Otp = mongoose.model("Otp", otpSchema);

export default Otp;