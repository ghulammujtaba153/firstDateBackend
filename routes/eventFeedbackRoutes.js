import express from 'express';
import { createEventFeedback, deleteEventFeedback, getEventFeedback } from '../controller/eventFeedbackController.js';


const eventFeedbackRouter = express.Router();

eventFeedbackRouter.post("/create", createEventFeedback)
eventFeedbackRouter.get("/get", getEventFeedback)
eventFeedbackRouter.delete("/delete/:id", deleteEventFeedback)


export default eventFeedbackRouter