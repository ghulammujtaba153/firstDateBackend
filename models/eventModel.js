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
    startDate: {
        type: Date
    },
    endDate: {
        type: Date
    },
    participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    status: {
        type: String,
        enum: ['upcoming', 'ongoing', 'completed'],
        default: 'upcoming'
    },
}, { timestamps: true });

const Event = mongoose.model("Event", eventSchema);

export default Event;
