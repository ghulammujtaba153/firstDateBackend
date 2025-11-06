import Like from "../models/likeModel.js";
import User from "../models/user.js";
import Notification from "../models/notificationModel.js";
import mongoose from "mongoose";

// 📌 Like a user
export const likeUser = async (req, res) => {
  try {
    const { likedUserId } = req.body;
    const likerUserId = req.user?.id || req.body.likerUserId; // Get from auth middleware or body

    if (!likedUserId || !likerUserId) {
      return res.status(400).json({ error: "likerUserId and likedUserId are required" });
    }

    // Prevent users from liking themselves
    if (likerUserId.toString() === likedUserId.toString()) {
      return res.status(400).json({ error: "You cannot like yourself" });
    }

    // Check if like already exists
    const existingLike = await Like.findOne({
      liker: likerUserId,
      liked: likedUserId
    });

    if (existingLike) {
      return res.status(400).json({ error: "You have already liked this user" });
    }

    // Validate user IDs
    if (!mongoose.Types.ObjectId.isValid(likerUserId) || !mongoose.Types.ObjectId.isValid(likedUserId)) {
      return res.status(400).json({ error: "Invalid user ID format" });
    }

    // Check if both users exist
    const [liker, liked] = await Promise.all([
      User.findById(likerUserId),
      User.findById(likedUserId)
    ]);

    if (!liker || !liked) {
      return res.status(404).json({ error: "User not found" });
    }

    // Create the like
    const like = new Like({
      liker: likerUserId,
      liked: likedUserId
    });
    await like.save();

    // Create notification for the liked user
    try {
      const notification = new Notification({
        userId: likedUserId,
        title: "New Like",
        message: `${liker.username || 'Someone'} liked your profile`,
        avatar: liker.avatar || null,
        link: `/dashboard/matches/${likerUserId}`, // Link to the liker's profile
        type: 'like',
        isRead: false
      });
      await notification.save();
    } catch (notificationError) {
      // Log error but don't fail the like operation
      console.error('Error creating notification:', notificationError);
    }

    res.status(201).json({ 
      message: "User liked successfully", 
      like,
      isLiked: true 
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: "You have already liked this user" });
    }
    res.status(500).json({ error: error.message });
  }
};

// 📌 Check if user has liked another user
export const checkLike = async (req, res) => {
  try {
    const { likedUserId } = req.params;
    const likerUserId = req.user?.id || req.query.likerUserId;

    if (!likedUserId || !likerUserId) {
      return res.status(400).json({ error: "likerUserId and likedUserId are required" });
    }

    if (!mongoose.Types.ObjectId.isValid(likerUserId) || !mongoose.Types.ObjectId.isValid(likedUserId)) {
      return res.status(400).json({ error: "Invalid user ID format" });
    }

    const like = await Like.findOne({
      liker: likerUserId,
      liked: likedUserId
    });

    res.status(200).json({ 
      isLiked: !!like,
      like: like || null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 📌 Unlike a user (remove like)
export const unlikeUser = async (req, res) => {
  try {
    const { likedUserId } = req.body;
    const likerUserId = req.user?.id || req.body.likerUserId;

    if (!likedUserId || !likerUserId) {
      return res.status(400).json({ error: "likerUserId and likedUserId are required" });
    }

    if (!mongoose.Types.ObjectId.isValid(likerUserId) || !mongoose.Types.ObjectId.isValid(likedUserId)) {
      return res.status(400).json({ error: "Invalid user ID format" });
    }

    const like = await Like.findOneAndDelete({
      liker: likerUserId,
      liked: likedUserId
    });

    if (!like) {
      return res.status(404).json({ error: "Like not found" });
    }

    res.status(200).json({ 
      message: "User unliked successfully",
      isLiked: false 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 📌 Get likes count for a user
export const getLikesCount = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid user ID format" });
    }

    const count = await Like.countDocuments({ liked: userId });
    res.status(200).json({ count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

