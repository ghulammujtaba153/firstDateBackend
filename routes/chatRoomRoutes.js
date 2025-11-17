import express from "express";
import {
  createOrGetChat,
  getUserChats,
  getChatMessages,
  sendMessage,
  updateMessageStatus,
  deleteMessage,
  getEventChats,
  updateChatStatus,
} from "../controller/chatRoomController.js";

const chatRoomRouter = express.Router();

// Chat management
chatRoomRouter.post("/create", createOrGetChat);
chatRoomRouter.post("/update-status", updateChatStatus);
chatRoomRouter.get("/user/:userId", getUserChats);
chatRoomRouter.get("/event/:userId", getEventChats);
// Messages
chatRoomRouter.get("/:chatId/messages", getChatMessages);
chatRoomRouter.post("/message", sendMessage);
chatRoomRouter.post("/message/update-status", updateMessageStatus);
chatRoomRouter.delete("/message/:id", deleteMessage);

export default chatRoomRouter;
