import User from "../models/user.js"
import MatchRefreshTimer from "../models/matchRefreshTimer.js"
import mongoose from "mongoose"


export const getRecomendedUsers = async (req, res) => {
    const { id } = req.params

    try {
        // Get current user to determine opposite gender
        let oppositeGender = null;

        if (id && mongoose.Types.ObjectId.isValid(id)) {
            const currentUser = await User.findById(id);
            if (currentUser && currentUser.gender) {
                // Determine opposite gender
                const userGender = currentUser.gender.toLowerCase();
                if (userGender === "man") {
                    oppositeGender = "woman";
                } else if (userGender === "woman") {
                    oppositeGender = "man";
                }
            }
        }

        // Build query for opposite gender users
        const query = {
            onboardingComlete: true,
            _id: { $ne: id } // Exclude current user
        };

        // Filter by opposite gender if available
        if (oppositeGender) {
            query.gender = { $regex: new RegExp(`^${oppositeGender}$`, "i") };
        }

        // Fetch users with opposite gender, limit to 2
        const users = await User.find(query).limit(2);
        res.status(200).json(users)
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
}


export const getAllUsers = async (req, res) => {
    try {
        const userId = req.user?.id || req.query?.userId;

        // Validate userId if provided
        if (userId && !mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ error: "Invalid user ID" });
        }

        // Get current user to determine opposite gender
        let currentUser = null;
        let oppositeGender = null;

        if (userId) {
            currentUser = await User.findById(userId);
            if (currentUser && currentUser.gender) {
                // Determine opposite gender
                const userGender = currentUser.gender.toLowerCase();
                if (userGender === "man") {
                    oppositeGender = "woman";
                } else if (userGender === "woman") {
                    oppositeGender = "man";
                }
                // If "other", we can show all genders or handle differently
            }
        }

        // Get or create timer for user (only if userId is provided)
        let timer = userId ? await MatchRefreshTimer.findOne({ userId }) : null;

        // If userId is provided, handle timer logic
        if (userId) {
            // If no timer exists or timer has expired, create/reset it
            const now = new Date();
            if (!timer || timer.expiresAt <= now) {
                // Set timer to expire in 7 days
                const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

                if (timer) {
                    // Update existing timer
                    timer.expiresAt = expiresAt;
                    timer.lastRefreshAt = now;
                    await timer.save();
                } else {
                    // Create new timer
                    timer = await MatchRefreshTimer.create({
                        userId,
                        expiresAt,
                        lastRefreshAt: now,
                    });
                }
            }
        }

        // Build query for opposite gender users
        const query = { onboardingComlete: true };

        // Exclude current user
        if (userId) {
            query._id = { $ne: userId };
        }

        // Filter by opposite gender if available
        if (oppositeGender) {
            query.gender = { $regex: new RegExp(`^${oppositeGender}$`, "i") };
        }

        // Fetch users with opposite gender, limit to 2
        const users = await User.find(query).limit(2);

        // Return response with or without timer data
        if (userId && timer) {
            res.status(200).json({
                users,
                timer: {
                    expiresAt: timer.expiresAt,
                    lastRefreshAt: timer.lastRefreshAt,
                }
            });
        } else {
            res.status(200).json(users);
        }
    } catch (error) {
        console.log(error.message)
        res.status(500).json({ error: "Server error" });
    }
}

// Get timer status for a user
export const getTimerStatus = async (req, res) => {
    try {
        const userId = req.user?.id || req.query?.userId;

        if (!userId) {
            return res.status(400).json({ error: "User ID is required" });
        }

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ error: "Invalid user ID" });
        }

        let timer = await MatchRefreshTimer.findOne({ userId });
        const now = new Date();

        // If no timer exists, create one
        if (!timer) {
            const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            timer = await MatchRefreshTimer.create({
                userId,
                expiresAt,
                lastRefreshAt: now,
            });
        }

        // Check if timer has expired
        const isExpired = timer.expiresAt <= now;

        res.status(200).json({
            expiresAt: timer.expiresAt,
            lastRefreshAt: timer.lastRefreshAt,
            isExpired,
            timeRemaining: isExpired ? 0 : timer.expiresAt.getTime() - now.getTime(),
        });
    } catch (error) {
        console.log(error.message);
        res.status(500).json({ error: "Server error" });
    }
}

// Reset timer and fetch new matches
export const resetTimerAndGetNewMatches = async (req, res) => {
    try {
        const userId = req.user?.id || req.query?.userId;

        if (!userId) {
            return res.status(400).json({ error: "User ID is required" });
        }

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ error: "Invalid user ID" });
        }

        // Get current user to determine opposite gender
        const currentUser = await User.findById(userId);
        let oppositeGender = null;

        if (currentUser && currentUser.gender) {
            // Determine opposite gender
            const userGender = currentUser.gender.toLowerCase();
            if (userGender === "man") {
                oppositeGender = "woman";
            } else if (userGender === "woman") {
                oppositeGender = "man";
            }
        }

        const now = new Date();
        const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        // Update or create timer
        let timer = await MatchRefreshTimer.findOneAndUpdate(
            { userId },
            {
                expiresAt,
                lastRefreshAt: now,
            },
            { upsert: true, new: true }
        );

        // Build query for opposite gender users
        const query = {
            onboardingComlete: true,
            _id: { $ne: userId } // Exclude current user
        };

        // Filter by opposite gender if available
        if (oppositeGender) {
            query.gender = { $regex: new RegExp(`^${oppositeGender}$`, "i") };
        }

        // Fetch new users with opposite gender, limit to 2
        const users = await User.find(query).limit(2);

        res.status(200).json({
            users,
            timer: {
                expiresAt: timer.expiresAt,
                lastRefreshAt: timer.lastRefreshAt,
            }
        });
    } catch (error) {
        console.log(error.message);
        res.status(500).json({ error: "Server error" });
    }
}


// Get user statistics for admin dashboard
export const getUserStats = async (req, res) => {
    try {
        // Total users
        const totalUsers = await User.countDocuments();

        // Active users (completed onboarding)
        const activeUsers = await User.countDocuments({ onboardingComlete: true });

        // Premium users
        const premiumUsers = await User.countDocuments({
            isPremium: true,
            premiumUntil: { $gt: new Date() } // Premium is still valid
        });

        // Flagged users (can be based on reports or other criteria - for now using verified status as inverse)
        // You can modify this based on your flagging logic
        const flaggedUsers = await User.countDocuments({ verified: false });

        // Calculate percentage changes (mock for now, can be enhanced with historical data)
        const activePercentage = totalUsers > 0 ? ((activeUsers / totalUsers) * 100).toFixed(1) : 0;
        const premiumPercentage = totalUsers > 0 ? ((premiumUsers / totalUsers) * 100).toFixed(1) : 0;

        res.status(200).json({
            totalUsers,
            activeUsers,
            premiumUsers,
            flaggedUsers,
            activePercentage: parseFloat(activePercentage),
            premiumPercentage: parseFloat(premiumPercentage),
        });
    } catch (error) {
        console.error("Error getting user stats:", error);
        res.status(500).json({ error: "Server error" });
    }
}

// Get all users for admin dashboard with pagination and filtering
export const getAllUsersForAdmin = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || '';
        const statusFilter = req.query.status || 'all';

        // Build query
        const query = {};

        // Search filter
        if (search) {
            query.$or = [
                { username: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
            ];
        }

        // Status filter
        if (statusFilter === 'active') {
            query.onboardingComlete = true;
        } else if (statusFilter === 'inactive') {
            query.onboardingComlete = false;
        } else if (statusFilter === 'suspended') {
            // You can add a suspended field to user model if needed
            query.verified = false;
        }

        // Get total count for pagination
        const total = await User.countDocuments(query);

        // Get users with pagination
        const users = await User.find(query)
            .select('-password') // Exclude password
            .sort({ createdAt: -1 }) // Newest first
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();



        res.status(200).json({
            users: users,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error("Error getting users for admin:", error);
        res.status(500).json({ error: "Server error" });
    }
}

// Helper function to calculate time ago
function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);

    if (seconds < 60) return `${seconds} seconds ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
    return `${Math.floor(seconds / 604800)} weeks ago`;
}