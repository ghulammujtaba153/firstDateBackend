import mongoose from 'mongoose';


const messageSchema = new mongoose.Schema({
  chatId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Chat",
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  content: { type: String, required: true },
  messageType: {
    type: String,
    enum: ["text", "image", "file", "video", "audio", "videoCall", "audioCall"],
    default: "text",
  },
  timestamp: { type: Date, default: Date.now },
  status: {
    type: String,
    enum: ["sent", "delivered", "read"],
    default: "sent",
  },
});

const Message = mongoose.model("Message", messageSchema);

export default Message;
