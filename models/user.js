import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    unique: true,
  },
  phone: {
    type: String,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  username: {
    type: String,
    unique: true,
  },
  gender: {
    type: String,
  },
  avatar: {
    type: String,
  },
  dob: {
    type: Date,
  },
  height: {
    type: Number,
  },
  weight: {
    type: Number,
  },
  bodyType: {
    type: [String],
  },
  healthInfo: {
    type: [String],
  },
  education: {
    field: {
      type: String,
      required: true, // make it optional if you want
      trim: true,
    },
    occupation: {
      type: String,
      required: true,
      trim: true,
    },
    university: {
      type: String,
      required: true,
      trim: true,
    },
  },
  hobbies: {
    type: [String],
  },
  images: {
    type: [String],
  },
  location: {
    type: String,
  },
  partnerAge: {
    min: { type: Number },
    max: { type: Number },
  },
  partnerBodyType: {
    type: [String]
  },
  partnerHealth: { type: [String]},
  partnerHobbies: { type: [String]},
  partnerLocation: { type: String},
  verfied: {
    type: Boolean,
    default: false,
  },

}, { timestamps: true });


const User = mongoose.model("User", userSchema);

export default User;
