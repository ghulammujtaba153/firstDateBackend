import express from "express";
import { createNotification, deleteNotification, getNotifications, markAllAsRead } from "../controller/notificationController.js";

const notificationRouter = express.Router();

notificationRouter.post("/create", createNotification);
notificationRouter.get("/user/:id", getNotifications);
notificationRouter.patch("/mark-read", markAllAsRead);
notificationRouter.delete("/delete/:id", deleteNotification);

export default notificationRouter;