import express from "express";
import { createSupportTicket, getSupportTickets, getSupportTicketById, updateSupportTicket, deleteSupportTicket } from "../controller/supportController.js";


const supportRouter = express.Router();

supportRouter.post("/create", createSupportTicket);
supportRouter.get("/get", getSupportTickets);
supportRouter.get("/get/:id", getSupportTicketById);
supportRouter.put("/update/:id", updateSupportTicket);
supportRouter.delete("/delete/:id", deleteSupportTicket);

export default supportRouter;