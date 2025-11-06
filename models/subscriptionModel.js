import mongoose from "mongoose"


const subscriptionSchema = new mongoose.Schema({
    title: { 
        type: String, 
        required: true 
    },
    features: {
        type: [String],
        required: true
    },
    price: { 
        type: Number, 
        required: true 
    },
    duration: { 
        type: String, 
        required: true 
    } // e.g. "monthly", "yearly"
})


const Subscription = mongoose.model("Subscription", subscriptionSchema);

export default Subscription