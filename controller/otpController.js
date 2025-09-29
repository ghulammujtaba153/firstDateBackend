import Otp from "../models/otp.js";
import User from "../models/user.js";


export const sendOtp = async (req, res) => {
    const { email } = req.body;
    try {
        const otpCode = Math.floor(100000 + Math.random() * 900000);

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const otp = await Otp.create({ email, code: otpCode });

        res.status(200).json({ message: 'OTP sent successfully', otp});
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
}



export const verifyOtp = async (req, res) => {
    const { email, code } = req.body;

    try {
        const otp = await Otp.findOne({ email, code });

        if (!otp) {
            return res.status(401).json({ message: 'Invalid OTP' });
        }
        await Otp.deleteOne({ email, code });
        
        res.status(200).json({ message: 'OTP verified successfully' });
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
}