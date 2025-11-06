import express from 'express';
import { createEvent, deleteEvent, getCompletedEvents, getEventById, getEvents, getOngoingEvents, getUpcomingEvents, getUserEvents, joinEvent, leaveEvent, updateEvent } from '../controller/eventController.js';


const eventRouter = express.Router();


eventRouter.post("/create", createEvent);
eventRouter.get("/get", getEvents);
eventRouter.get("/upcoming", getUpcomingEvents);
eventRouter.get("/ongoing", getOngoingEvents);
eventRouter.get("/completed", getCompletedEvents);
eventRouter.get("/user/:userId", getUserEvents);
eventRouter.get("/:id", getEventById);
eventRouter.put("/:id", updateEvent);
eventRouter.delete("/:id", deleteEvent);
eventRouter.post("/:eventId/join", joinEvent);
eventRouter.post("/:eventId/leave", leaveEvent);

export default eventRouter