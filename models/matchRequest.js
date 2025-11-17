import mongoose from "mongoose";

const matchRequestSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    requestedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    status: {
        type: String,
        enum: ["pending", "accepted", "rejected", "blocked"],
        default: "pending"
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const MatchRequest = mongoose.model("MatchRequest", matchRequestSchema);

export default MatchRequest;