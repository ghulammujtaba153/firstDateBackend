import EventFeedback from "../models/eventFeedbackModel.js";


export const createEventFeedback = async (req, res) => {
    try {
        const eventFeedback = new EventFeedback(req.body);
        await eventFeedback.save();
        res.status(201).json(eventFeedback);
    } catch (error) {
        res.status(400).json(error);
    }
}

export const getEventFeedback = async (req, res) => {
    try {
        const eventFeedback = await EventFeedback.find().populate('eventId').populate('userId');
        res.status(200).json(eventFeedback);
    } catch (error) {
        res.status(400).json(error);
    }
}

export const deleteEventFeedback = async (req, res) => {
    try {
        const eventFeedback = await EventFeedback.findByIdAndDelete(req.params.id);
        if (!eventFeedback) {
            return res.status(404).json({ message: "Event feedback not found" });
        }
        res.status(200).json({ message: "Event feedback deleted successfully" });
    } catch (error) {
        res.status(400).json(error);
    }
}