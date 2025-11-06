import Notification from "../models/notificationModel.js";


export const createNotification = async (req, res) => {
    try {
        const notification = new Notification(req.body);
        await notification.save();
        res.status(201).json(notification);
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
}


export const getNotifications = async (req, res) => {
    try {
        const notifications = await Notification.find({ userId: req.params.id }).sort({ createdAt: -1 });
        res.status(200).json(notifications);
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
}

export const markAllAsRead = async (req, res) => {
    const { notificationIds = [] } = req.body;
    try {
        if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
            return res.status(400).json({ error: "No notification IDs provided" });
        }
        await Notification.updateMany(
            { _id: { $in: notificationIds } },
            { $set: { isRead: true } }
        );
        res.status(200).json({ message: "Selected notifications marked as read" });
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
}


export const deleteNotification = async (req, res) => {
    try {
        await Notification.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Notification deleted" });
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
}