import Chat from "../models/chatModel.js";
import Message from "../models/messageModel.js";

/**
 * Create or Get Chat Room between two users
 * If a chat between the same participants exists, return it instead of creating a new one
 */
export const createOrGetChat = async (req, res) => {
  try {
    const { participants } = req.body;

    if (!participants || participants.length < 2) {
      return res.status(400).json({ error: "At least two participants are required" });
    }

    // Check if chat already exists between same participants
    const existingChat = await Chat.findOne({
      participants: { $all: participants, $size: participants.length },
    }).populate("participants", "username email avatar");

    if (existingChat) {
      return res.status(200).json(existingChat);
    }

    // Create new chat
    const newChat = await Chat.create({ participants });
    const populatedChat = await newChat.populate("participants", "username email avatar");

    res.status(201).json(populatedChat);
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
    const chats = await Chat.find({ participants: userId })
      .populate("participants", "username email avatar")
      .sort({ createdAt: -1 });

    // Get last message for each chat
    const chatsWithLastMessage = await Promise.all(
      chats.map(async (chat) => {
        const lastMessage = await Message.findOne({ chatId: chat._id })
          .populate("sender", "username email avatar")
          .sort({ timestamp: -1 })
          .limit(1);

        return {
          ...chat.toObject(),
          lastMessage: lastMessage || null,
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
 */
export const updateMessageStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["sent", "delivered", "read"].includes(status)) {
      return res.status(400).json({ error: "Invalid message status" });
    }

    const updatedMessage = await Message.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!updatedMessage) {
      return res.status(404).json({ error: "Message not found" });
    }

    res.status(200).json(updatedMessage);
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
