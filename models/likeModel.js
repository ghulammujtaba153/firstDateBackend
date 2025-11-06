import mongoose from "mongoose";

const likeSchema = new mongoose.Schema({
  liker: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  liked: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Ensure one user can only like another user once
likeSchema.index({ liker: 1, liked: 1 }, { unique: true });

const Like = mongoose.model("Like", likeSchema);

export default Like;

