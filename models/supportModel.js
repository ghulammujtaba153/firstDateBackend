import mongoose from "mongoose";


const supportSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    subject: {
        type: String,
        required: true,
    },
    message: {
        type: String,
        required: true,
    },
    reply: {
        type: String,
    },
    status: {
        type: String,
        enum: ["pending", "resolved", "closed"],
        default: "pending",
    },
}, { timestamps: true });

const Support = mongoose.model("Support", supportSchema);

export default Support;