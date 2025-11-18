import mongoose from "mongoose";


const coupleMatchSchema = new mongoose.Schema({
    couple: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
    ],
    status: {
        type: String,
        enum: ["pending", "matched", "unmatched"],
        default: "pending"
    },
});


const CoupleMatch = mongoose.model("CoupleMatch", coupleMatchSchema);

export default CoupleMatch;