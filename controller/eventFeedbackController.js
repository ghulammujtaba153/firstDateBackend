import EventFeedback from "../models/eventFeedbackModel.js";


export const createEventFeedback = async (req, res) => {
    try {
        const { eventId, userId, rating, feedback } = req.body;

        if (!eventId || !userId || !rating || !feedback) {
            return res.status(400).json({ error: "eventId, userId, rating, and feedback are required" });
        }

        if (rating < 1 || rating > 5) {
            return res.status(400).json({ error: "Rating must be between 1 and 5" });
        }

        // Check if feedback already exists for this user and event
        const existingFeedback = await EventFeedback.findOne({ eventId, userId });

        if (existingFeedback) {
            // Update existing feedback
            existingFeedback.rating = rating;
            existingFeedback.feedback = feedback;
            await existingFeedback.save();
            await existingFeedback.populate('eventId');
            await existingFeedback.populate('userId', 'username email avatar');
            return res.status(200).json(existingFeedback);
        } else {
            // Create new feedback
            const eventFeedback = new EventFeedback({ eventId, userId, rating, feedback });
            await eventFeedback.save();
            await eventFeedback.populate('eventId');
            await eventFeedback.populate('userId', 'username email avatar');
            return res.status(201).json(eventFeedback);
        }
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

export const getEventFeedback = async (req, res) => {
    try {
        const { eventId, userId } = req.query;
        const query = {};
        
        if (eventId) {
            query.eventId = eventId;
        }
        if (userId) {
            query.userId = userId;
        }
        
        const eventFeedback = await EventFeedback.find(query)
            .populate('eventId')
            .populate('userId', 'username email avatar')
            .sort({ createdAt: -1 });
        res.status(200).json(eventFeedback);
    } catch (error) {
        res.status(400).json({ error: error.message });
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