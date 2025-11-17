import MatchRequest from "../models/matchRequest.js";
import Chat from "../models/chatModel.js";


export const createMatchRequest = async (req, res) => {
  try {
    const { userId, requestedTo } = req.body;

    if (!userId || !requestedTo) {
      return res
        .status(400)
        .json({ error: "userId and requestedTo are required" });
    }

    if (userId === requestedTo) {
      return res
        .status(400)
        .json({ error: "You cannot send a match request to yourself." });
    }

    // Check if a request already exists between same users
    const existingRequest = await MatchRequest.findOne({
      userId, // sender
      requestedTo, // receiver
    }).lean();

    if (existingRequest) {
      return res.status(200).json({
        message: "Match request already exists",
        request: existingRequest,
      });
    }

    // Create new match request
    const newRequest = await MatchRequest.create({
      userId,
      requestedTo,
      status: "pending",
    });

    return res.status(201).json({
      message: "Match request created",
      request: newRequest,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const getIncomingRequests = async (req, res) => {
  try {
    const { receiverId, senderId } = req.body;

    if (!receiverId || !senderId) {
      return res
        .status(400)
        .json({ error: "senderId and receiverId are required" });
    }

    const matchRequests = await MatchRequest.find({
      userId: senderId,
      requestedTo: receiverId,
    }).lean();

    return res.status(200).json(matchRequests);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const getReceivedRequests = async (req, res) => {
  try {
    const { receiverId } = req.body;

    if (!receiverId) {
      return res.status(400).json({ error: "receiverId is required" });
    }

    // Find all requests sent TO this user
    const received = await MatchRequest.find({ requestedTo: receiverId }).lean();

    return res.status(200).json(received);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const acceptMatchRequest = async (req, res) => {
  try {
    const { requestId } = req.body;

    if (!requestId) {
      return res.status(400).json({ error: "requestId is required" });
    }

    const request = await MatchRequest.findByIdAndUpdate(
      requestId,
      { status: "accepted" },
      { new: true }
    );

    const chat = await Chat.findOne({ participants: { $all: [request.userId, request.requestedTo] } });
    if (chat) {
      return res.status(200).json({
        message: "Chat already exists",
        chat,
      });
    }
    else {
      await Chat.create({
        participants: [request.userId, request.requestedTo]
      });
    }

    if (!request) {
      return res.status(404).json({ error: "Match request not found" });
    }

    return res.status(200).json({
      message: "Request accepted",
      request,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const rejectMatchRequest = async (req, res) => {
  try {
    const { requestId } = req.body;

    if (!requestId) {
      return res.status(400).json({ error: "requestId is required" });
    }

    const request = await MatchRequest.findByIdAndUpdate(
      requestId,
      { status: "rejected" },
      { new: true }
    );

    if (!request) {
      return res.status(404).json({ error: "Match request not found" });
    }

    return res.status(200).json({
      message: "Request rejected",
      request,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
