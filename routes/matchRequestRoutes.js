import express from "express";
import {
  createMatchRequest,
  getIncomingRequests,
  getReceivedRequests,
  acceptMatchRequest,
  rejectMatchRequest,
} from "../controller/matchRequestController.js";

const matchRequestRouter = express.Router();

matchRequestRouter.post("/create", createMatchRequest);
matchRequestRouter.post("/incoming", getIncomingRequests);
matchRequestRouter.post("/get-received", getReceivedRequests);
matchRequestRouter.post("/accept", acceptMatchRequest);
matchRequestRouter.post("/reject", rejectMatchRequest);

export default matchRequestRouter;