import UserSubscription from "../models/userSubscriptionModel.js";


export const createUserSubscription = async (req, res) => {
    try {
        const userSubscription = new UserSubscription(req.body);
        await userSubscription.save();
        res.status(201).json(userSubscription);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}


export const getUserSubscriptions = async (req, res) => {
    try {
        const userSubscriptions = await UserSubscription.find().populate('userId').populate('subscriptionId');
        res.status(200).json(userSubscriptions);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

export const getUserSubscriptionById = async (req, res) => {
    try {
        const userSubscription = await UserSubscription.findById(req.params.id).populate('userId').populate('subscriptionId');
        if (!userSubscription) {
            return res.status(404).json({ message: "User Subscription not found" });
        }
        res.status(200).json(userSubscription);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}


export const updateUserSubscription = async (req, res) => {
    try {
        const userSubscription = await UserSubscription.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!userSubscription) {
            return res.status(404).json({ message: "User Subscription not found" });
        }
        res.status(200).json(userSubscription);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

export const deleteUserSubscription = async (req, res) => {
    try {
        const userSubscription = await UserSubscription.findByIdAndDelete(req.params.id);
        if (!userSubscription) {
            return res.status(404).json({ message: "User Subscription not found" });
        }
        res.status(200).json({ message: "User Subscription deleted successfully" });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}