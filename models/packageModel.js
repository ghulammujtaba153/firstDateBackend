import mongoose from "mongoose";

const packageSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
    },
    features: {
        type: [String]
    },
    price: {
        type: Number,
        required: true
    },
    type: {
        type: String,
        enum: ["weekly", "yearly", "one-time"],
        default: "one-time"
    },
    mostPopular: {
        type: Boolean,
        default: false,
    },
    stripePriceId: {
        type: String,
    },
    stripeProductId: {
        type: String,
    },
    active: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
})


const Package = mongoose.model("Package", packageSchema)


export default Package;