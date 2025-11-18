import express from "express";
import {
  createMatchRequest,
  getIncomingRequests,
  acceptMatchRequest,
  rejectMatchRequest,
  sentRequests,
} from "../controller/matchRequestController.js";

const matchRequestRouter = express.Router();

matchRequestRouter.post("/create", createMatchRequest);
matchRequestRouter.post("/incoming", getIncomingRequests);
matchRequestRouter.post("/sent", sentRequests);
matchRequestRouter.post("/accept", acceptMatchRequest);
matchRequestRouter.post("/reject", rejectMatchRequest);

export default matchRequestRouter;