import express from "express";
import {
  createOrGetChat,
  getUserChats,
  getChatMessages,
  sendMessage,
  updateMessageStatus,
  deleteMessage,
} from "../controller/chatRoomController.js";

const chatRoomRouter = express.Router();

// Chat management
chatRoomRouter.post("/create", createOrGetChat);
chatRoomRouter.get("/user/:userId", getUserChats);

// Messages
chatRoomRouter.get("/:chatId/messages", getChatMessages);
chatRoomRouter.post("/message", sendMessage);
chatRoomRouter.patch("/message/:id/status", updateMessageStatus);
chatRoomRouter.delete("/message/:id", deleteMessage);

export default chatRoomRouter;
