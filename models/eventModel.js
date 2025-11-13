import mongoose from "mongoose";


const eventSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    image: {
        type: String, // Optional event image URL
    },
    type: {
        type: String,   
    },
    date: {
        type: Date,
        required: true
    },
    time: {
        type: String,
        required: true
    },
    duration: {
        type: Number,
        required: true
    },
    maxSlots: {
        type: Number,
        required: true
    },
    price: {
        type: Number,
        required: true
    },
    participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    status: {
        type: String,
        enum: ['open', 'closed', "completed"],
        default: 'open'
    },
}, { timestamps: true });

const Event = mongoose.model("Event", eventSchema);

export default Event;
