import MatchRequest from "../models/matchRequest.js";
import Chat from "../models/chatModel.js";
import Notification from "../models/notificationModel.js";

export const createMatchRequest = async (req, res) => {
  try {
    const { userId, requestedTo } = req.body;

    if (!userId || !requestedTo) {
      return res.status(400).json({ error: "userId and requestedTo are required" });
    }
    if (userId === requestedTo) {
      return res.status(400).json({ error: "You cannot send a match request to yourself." });
    }

    // If there is already a chat between them, don't allow requests
    const existingChat = await Chat.findOne({
      type: "private",
      participants: { $all: [userId, requestedTo] },
    });
    if (existingChat) {
      return res.status(409).json({ message: "Chat already exists between users", chat: existingChat });
    }

    // If the same request already exists, return it
    const existingRequest = await MatchRequest.findOne({ userId, requestedTo }).lean();
    if (existingRequest) {
      return res.status(200).json({ message: "Match request already exists", request: existingRequest });
    }

    // If the other user already sent a request to this user (reverse request),
    // inform the client so UI can show "Accept" instead of allowing to send another request.
    const reverseRequest = await MatchRequest.findOne({ userId: requestedTo, requestedTo: userId }).lean();
    if (reverseRequest) {
      // If reverse is pending, let client know there's an incoming pending request
      if (reverseRequest.status === "pending") {
        return res.status(409).json({
          message: "Incoming request exists",
          code: "incoming_request_exists",
          incomingRequest: reverseRequest,
        });
      }
      // If reverse was accepted => chat should exist, but handle gracefully
      if (reverseRequest.status === "accepted") {
        return res.status(409).json({ message: "Users already matched", request: reverseRequest });
      }
    }

    // Create new match request
    const newRequest = await MatchRequest.create({
      userId,
      requestedTo,
      status: "pending",
    });

    const requestInfo = await MatchRequest.findById(newRequest._id).populate("userId").populate("requestedTo");
    console.log(requestInfo)
    const NotificationData = {
      userId: requestInfo.requestedTo._id,
      title: "Match Request Incoming",
      avatar: requestInfo.userId.avatar || requestInfo.userId.images[0],
      type: "match",
      link: `/dashboard/events-chat`,
      message: `You have received a match request from ${requestInfo.userId.username}`,

    }

    await Notification.create(NotificationData)

    // Emit socket event to notify the receiver in real-time
    const io = req.app.get("io");
    if (io) {
      io.to(`user:${requestedTo}`).emit("match-request:new", {
        request: newRequest,
        fromUserId: userId,
      });
    }

    return res.status(201).json({ message: "Match request created", request: newRequest });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const getIncomingRequests = async (req, res) => {
  try {
    const { receiverId } = req.body;
    if (!receiverId) return res.status(400).json({ error: "receiverId is required" });

    // incoming = requests where current user is requestedTo
    const incoming = await MatchRequest.find({ requestedTo: receiverId }).lean();
    return res.status(200).json(incoming);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const sentRequests = async (req, res) => {
  try {
    const { senderId } = req.body;
    if (!senderId) return res.status(400).json({ error: "senderId is required" });

    // sent = requests created by this user
    const sent = await MatchRequest.find({ userId: senderId }).lean();
    return res.status(200).json(sent);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const acceptMatchRequest = async (req, res) => {
  try {
    const { requestId } = req.body;
    if (!requestId) return res.status(400).json({ error: "requestId is required" });

    // Mark request accepted (idempotent)
    const request = await MatchRequest.findByIdAndUpdate(
      requestId,
      { status: "accepted" },
      { new: true }
    );
    if (!request) return res.status(404).json({ error: "Match request not found" });

    const requestInfo = await MatchRequest.findById(request._id).populate("userId").populate("requestedTo");

    const NotificationData = {
      userId: requestInfo.userId._id,
      title: "Match Request Accepted",
      avatar: requestInfo.requestedTo.avatar || requestInfo.requestedTo.images[0],
      type: "match",
      link: `/dashboard/chats`,
      message: `Your request for match has been accepted`,

    }

    await Notification.create(NotificationData)

    // Ensure only one private chat exists between users
    const existingChat = await Chat.findOne({
      type: "private",
      participants: { $all: [request.userId, request.requestedTo] },
    });
    const io = req.app.get("io");

    // Emit events
    if (io) {
      io.to(`user:${request.userId}`).emit("match-request:accepted", {
        request,
        acceptedByUserId: request.requestedTo,
      });
      io.to(`user:${request.requestedTo}`).emit("match-request:status-updated", {
        request,
        status: "accepted",
      });
    }

    if (existingChat) {
      return res.status(200).json({ message: "Chat already exists", chat: existingChat, request });
    }

    // Create new private chat
    const newChat = await Chat.create({
      participants: [request.userId, request.requestedTo],
      type: "private",
    });

    // Notify both users about the new chat
    if (io) {
      io.to(`user:${request.userId}`).emit("chat:created", { chat: newChat });
      io.to(`user:${request.requestedTo}`).emit("chat:created", { chat: newChat });
    }

    return res.status(200).json({ message: "Request accepted", request, chat: newChat });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const rejectMatchRequest = async (req, res) => {
  try {
    const { requestId } = req.body;
    if (!requestId) return res.status(400).json({ error: "requestId is required" });

    const request = await MatchRequest.findByIdAndUpdate(requestId, { status: "rejected" }, { new: true });
    if (!request) return res.status(404).json({ error: "Match request not found" });

    const io = req.app.get("io");
    if (io) {
      io.to(`user:${request.userId}`).emit("match-request:rejected", {
        request,
        rejectedByUserId: request.requestedTo,
      });
      io.to(`user:${request.requestedTo}`).emit("match-request:status-updated", {
        request,
        status: "rejected",
      });
    }

    return res.status(200).json({ message: "Request rejected", request });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
