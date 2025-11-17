import Chat from "../models/chatModel.js";
import Message from "../models/messageModel.js";

/**
 * Create or Get Chat Room between two users
 * If a chat between the same participants exists, return it instead of creating a new one
 */
export const createOrGetChat = async (req, res) => {
  try {
    const { participants, type, eventId } = req.body;

    if (!participants || participants.length < 2) {
      return res.status(400).json({ error: "At least two participants are required" });
    }

    const chatData = {
      participants,
      type: type || "private",
    };

    // Optional event type
    if (type === "event") {
      chatData.eventId = eventId;
      chatData.expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    }

    // Check if chat exists
    const existingChat = await Chat.findOne({
      participants: { $all: participants, $size: participants.length },
      type,             // type must match
      eventId: eventId || null, // event must match too
    }).populate("participants", "username email avatar");

    if (existingChat) {
      return res.status(200).json(existingChat);
    }

    // Create new chat with correct data
    const newChat = await Chat.create(chatData);
    const populatedChat = await newChat.populate("participants", "username email avatar");

    res.status(201).json(populatedChat);

  } catch (error) {
    console.error("Chat creation error:", error);
    res.status(500).json({ error: error.message });
  }
};


export const updateChatStatus = async (req, res) => {
  try {
    const { chatId, status } = req.body;
    const chat = await Chat.findByIdAndUpdate(chatId, { status }, { new: true });
    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }
    res.status(200).json(chat);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get all chats for a specific user
 */
export const getUserChats = async (req, res) => {
  try {
    const { userId } = req.params;
    const chats = await Chat.find({ participants: userId, type: 'private' })
      .populate("participants", "username email avatar")
      .sort({ createdAt: -1 });

    // Get last message and unread count for each chat
    const chatsWithLastMessage = await Promise.all(
      chats.map(async (chat) => {
        const lastMessage = await Message.findOne({ chatId: chat._id })
          .populate("sender", "username email avatar")
          .sort({ timestamp: -1 })
          .limit(1);

        // Count unread messages (messages not sent by current user and status is not 'read')
        const unreadCount = await Message.countDocuments({
          chatId: chat._id,
          sender: { $ne: userId },
          status: { $ne: 'read' }
        });

        return {
          ...chat.toObject(),
          lastMessage: lastMessage || null,
          unreadCount: unreadCount || 0,
        };
      })
    );

    // Sort by last message timestamp (most recent first)
    chatsWithLastMessage.sort((a, b) => {
      const aTime = a.lastMessage?.timestamp || a.createdAt || 0;
      const bTime = b.lastMessage?.timestamp || b.createdAt || 0;
      return new Date(bTime) - new Date(aTime);
    });

    res.status(200).json(chatsWithLastMessage);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


export const getEventChats = async (req, res) => {
    try {
      const { userId } = req.params;
      const chats = await Chat.find({ participants: userId, type: 'event' })
        .populate("participants", "username email avatar")
        .sort({ createdAt: -1 });
  
      // Get last message and unread count for each chat
      const chatsWithLastMessage = await Promise.all(
        chats.map(async (chat) => {
          const lastMessage = await Message.findOne({ chatId: chat._id })
            .populate("sender", "username email avatar")
            .sort({ timestamp: -1 })
            .limit(1);
  
          // Count unread messages (messages not sent by current user and status is not 'read')
          const unreadCount = await Message.countDocuments({
            chatId: chat._id,
            sender: { $ne: userId },
            status: { $ne: 'read' }
          });
  
          return {
            ...chat.toObject(),
            lastMessage: lastMessage || null,
            unreadCount: unreadCount || 0,
          };
        })
      );
  
      // Sort by last message timestamp (most recent first)
      chatsWithLastMessage.sort((a, b) => {
        const aTime = a.lastMessage?.timestamp || a.createdAt || 0;
        const bTime = b.lastMessage?.timestamp || b.createdAt || 0;
        return new Date(bTime) - new Date(aTime);
      });
  
      res.status(200).json(chatsWithLastMessage);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  
};

/**
 * Get messages of a specific chat
 */
export const getChatMessages = async (req, res) => {
  try {
    const { chatId } = req.params;
    const messages = await Message.find({ chatId })
      .populate("sender", "username email avatar")
      .sort({ timestamp: 1 });

    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Send message in chat
 */
export const sendMessage = async (req, res) => {
  try {
    const { chatId, sender, content, messageType } = req.body;

    if (!chatId || !sender || !content) {
      return res.status(400).json({ error: "chatId, sender, and content are required" });
    }

    const message = await Message.create({
      chatId,
      sender,
      content,
      messageType,
    });

    const populatedMessage = await message.populate("sender", "username email avatar");
    
    // Emit Socket.io event to notify all users in the chat room
    const io = req.app.get('io');
    if (io) {
      io.to(`chat:${chatId}`).emit('message:new', {
        chatId,
        message: populatedMessage
      });
    }

    res.status(201).json(populatedMessage);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Update message status (sent, delivered, read)
 * Supports both single message update and bulk update for a chat
 */
export const updateMessageStatus = async (req, res) => {
  try {
    const { chatId, userId } = req.body;
    const { status } = req.body;

    if (!["sent", "delivered", "read"].includes(status)) {
      return res.status(400).json({ error: "Invalid message status" });
    }

    // If chatId and userId are provided, mark all unread messages in that chat as read
    if (chatId && userId && status === "read") {
      const result = await Message.updateMany(
        {
          chatId: chatId,
          sender: { $ne: userId }, // Messages not sent by the current user
          status: { $ne: "read" } // Only update messages that are not already read
        },
        {
          $set: { status: "read" }
        }
      );

      return res.status(200).json({
        success: true,
        updatedCount: result.modifiedCount,
        message: `Marked ${result.modifiedCount} messages as read`
      });
    }

    // Single message update (backward compatibility)
    const { id } = req.body;
    if (id) {
      const updatedMessage = await Message.findByIdAndUpdate(
        id,
        { status },
        { new: true }
      );

      if (!updatedMessage) {
        return res.status(404).json({ error: "Message not found" });
      }

      return res.status(200).json(updatedMessage);
    }

    return res.status(400).json({ error: "Either chatId+userId or id is required" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Delete message
 */
export const deleteMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedMessage = await Message.findByIdAndDelete(id);

    if (!deletedMessage) {
      return res.status(404).json({ error: "Message not found" });
    }

    res.status(200).json({ message: "Message deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
