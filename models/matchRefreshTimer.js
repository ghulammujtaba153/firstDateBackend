import mongoose from "mongoose";

const matchRefreshTimerSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  lastRefreshAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

// Index for faster queries
matchRefreshTimerSchema.index({ userId: 1 });
matchRefreshTimerSchema.index({ expiresAt: 1 });

const MatchRefreshTimer = mongoose.model("MatchRefreshTimer", matchRefreshTimerSchema);

export default MatchRefreshTimer;

