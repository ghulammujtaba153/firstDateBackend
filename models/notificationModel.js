import mongoose from "mongoose";


const createNotificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  message: { type: String, required: true },
  title: { type: String }, // Optional title for the notification
  avatar: { type: String }, // Optional avatar URL (e.g., sender's avatar, event image, etc.)
  link: { type: String }, // Optional link/URL to navigate when notification is clicked
  type: { 
    type: String, 
    enum: ['like', 'match', 'message', 'event', 'system', 'other'], 
    default: 'other' 
  }, // Type of notification for better categorization
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Update the updatedAt field before saving
createNotificationSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const Notification = mongoose.model("Notification", createNotificationSchema);

export default Notification;