import mongoose from "mongoose";

const userSubscriptionSchema = new mongoose.Schema({
    userId : {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    subscriptionId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'Subscription'
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'cancelled'],
        default: 'active'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const UserSubscription = mongoose.model('UserSubscription', userSubscriptionSchema);

export default UserSubscription;