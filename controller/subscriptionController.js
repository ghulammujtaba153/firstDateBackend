import Subscription from "../models/subscriptionModel.js";


export const createSubscription = async (req, res) => {
    try {
        const subscription = new Subscription(req.body);
        await subscription.save();
        res.status(201).json(subscription);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}


export const getSubscriptions = async (req, res) => {
    try {
        const subscriptions = await Subscription.find();
        res.status(200).json(subscriptions);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}


export const getSubscriptionById = async (req, res) => {
    try {
        const subscription = await Subscription.findById(req.params.id);
        if (!subscription) {
            return res.status(404).json({ message: "Subscription not found" });
        }
        res.status(200).json(subscription);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}


export const updateSubscription = async (req, res) => {
    try {
        const subscription = await Subscription.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!subscription) {
            return res.status(404).json({ message: "Subscription not found" });
        }
        res.status(200).json(subscription);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}


export const deleteSubscription = async (req, res) => {
    try {
        const subscription = await Subscription.findByIdAndDelete(req.params.id);
        if (!subscription) {
            return res.status(404).json({ message: "Subscription not found" });
        }
        res.status(200).json({ message: "Subscription deleted successfully" });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}