import Event from "../models/eventModel.js";
import User from "../models/user.js";
import Notification from "../models/notificationModel.js";
import mongoose from "mongoose";

// 📌 Create new event
export const createEvent = async (req, res) => {
  try {
    const event = new Event(req.body);
    await event.save();

    // Send notifications to all users (or users who have completed onboarding)
    try {
      const users = await User.find({ onboardingComlete: true }).select('_id');
      
      // Create notifications for all users
      const notifications = users.map(user => ({
        userId: user._id,
        title: "New Event Available",
        message: `${event.title} - ${event.description?.substring(0, 100)}${event.description?.length > 100 ? '...' : ''}`,
        avatar: event.image || null, // If event has an image field
        link: `/dashboard/events`, // Link to event detail page
        type: 'event',
        isRead: false
      }));

      // Bulk insert notifications
      if (notifications.length > 0) {
        await Notification.insertMany(notifications);
      }
    } catch (notificationError) {
      // Log error but don't fail the event creation
      console.error('Error creating notifications:', notificationError);
    }

    res.status(201).json(event);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// 📌 Get all events
export const getEvents = async (req, res) => {
  try {
    const events = await Event.find().populate('participants');
    res.status(200).json(events);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// 📌 Get single event by ID
export const getEventById = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id).populate('participants');
    if (!event) return res.status(404).json({ message: "Event not found" });
    res.status(200).json(event);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// 📌 Update event details
export const updateEvent = async (req, res) => {
  try {
    const event = await Event.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!event) return res.status(404).json({ message: "Event not found" });
    res.status(200).json(event);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// 📌 Delete an event
export const deleteEvent = async (req, res) => {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);
    if (!event) return res.status(404).json({ message: "Event not found" });
    res.status(200).json({ message: "Event deleted successfully" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// 📌 Get upcoming events
export const getUpcomingEvents = async (req, res) => {
  try {
    const now = new Date();
    // Get events that are in the future (by startDate or date)
    // Exclude completed events
    const events = await Event.find({
      $and: [
        {
          $or: [
            { 
              $and: [
                { startDate: { $exists: true } },
                { startDate: { $gt: now } }
              ]
            },
            { 
              $and: [
                { date: { $exists: true } },
                { date: { $gt: now } },
                { startDate: { $exists: false } } // Only use date if startDate doesn't exist
              ]
            }
          ]
        },
        { status: { $ne: 'completed' } }
      ]
    }).populate('participants');
    res.status(200).json(events);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// 📌 Get ongoing events
export const getOngoingEvents = async (req, res) => {
  try {
    const now = new Date();
    const events = await Event.find({
      $or: [
        {
          startDate: { $lte: now },
          endDate: { $gte: now }
        },
        {
          date: { $lte: now },
          $expr: {
            $gte: [
              { $add: ['$date', { $multiply: ['$duration', 60000] }] },
              now
            ]
          }
        }
      ],
      status: { $ne: 'completed' }
    }).populate('participants');
    res.status(200).json(events);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// 📌 Get completed events
export const getCompletedEvents = async (req, res) => {
  try {
    const now = new Date();
    // Only return events that are actually completed
    // Must have status 'completed' OR be past their end date
    // Exclude events with future startDate
    const events = await Event.find({
      $and: [
        {
          $or: [
            { status: 'completed' },
            {
              $and: [
                { endDate: { $exists: true } },
                { endDate: { $lt: now } }
              ]
            },
            {
              $and: [
                { date: { $exists: true } },
                { startDate: { $exists: false } }, // Only use date if startDate doesn't exist
                { 
                  $expr: {
                    $lt: [
                      { $add: ['$date', { $multiply: ['$duration', 60000] }] },
                      now
                    ]
                  }
                }
              ]
            }
          ]
        },
        {
          // Exclude events with future startDate (they should be in upcoming)
          $or: [
            { startDate: { $exists: false } },
            { startDate: { $lte: now } }
          ]
        }
      ]
    }).populate('participants');
    res.status(200).json(events);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// 📌 Get events for a specific user (joined)
export const getUserEvents = async (req, res) => {
  try {
    const userId = req.params.userId;
    const events = await Event.find({ participants: userId }).populate('participants');
    res.status(200).json(events);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// 📌 Join an event
export const joinEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { userId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(eventId) || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid ID format" });
    }

    const event = await Event.findById(eventId);

    if (event.status === 'closed') {
      return res.status(400).json({ message: "Event is closed" });
    }
    if (event.participants.length >= event.maxSlots) {
      return res.status(400).json({ message: "Event is full" });
    }
    if (!event) return res.status(404).json({ message: "Event not found" });

    if (event.participants.includes(userId)) {
      return res.status(400).json({ message: "User already joined" });
    }

    event.participants.push(userId);
    await event.save();

    res.status(200).json({ message: "Joined event successfully", event });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// 📌 Leave an event
export const leaveEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { userId } = req.body;

    const event = await Event.findById(eventId);
    if (event.status === 'closed') {
      return res.status(400).json({ message: "Event is closed" });
    }
    if (event.participants.length === 0) {
      return res.status(400).json({ message: "Event has no participants" });
    }
    if (!event) return res.status(404).json({ message: "Event not found" });

    event.participants = event.participants.filter(
      (id) => id.toString() !== userId
    );

    await event.save();
    res.status(200).json({ message: "Left event successfully", event });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
