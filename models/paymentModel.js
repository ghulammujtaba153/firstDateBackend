import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
    eventId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'usd'
    },
    paymentIntentId: {
        type: String,
        required: true
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'succeeded', 'failed', 'refunded'],
        default: 'pending'
    },
    stripeChargeId: {
        type: String,
    },
    refundId: {
        type: String,
    },
    metadata: {
        type: Map,
        of: String
    }
}, { timestamps: true });

const Payment = mongoose.model('Payment', paymentSchema);

export default Payment;

