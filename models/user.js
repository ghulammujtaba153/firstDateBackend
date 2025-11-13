import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    unique: true,
  },
  phone: {
    type: String,
  },
  password: {
    type: String,
    
  },
  username: {
    type: String,
    // unique: true,
  },
  gender: {
    type: String,
  },
  avatar: {
    type: String,
  },
  dob: {
    type: String,
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
      trim: true,
    },
    occupation: {
      type: String,
      trim: true,
    },
    university: {
      type: String,
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
    latitude: { type: Number },
    longitude: { type: Number }
  },
  personality: { type: [String]},
  politics: { type: String},
  religion: { type: String},
  family: {
    haveKids: { type: Boolean },
    wantKids: { type: Boolean },
  },
  chatOpeners: { type: [String]},
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
  partnerPersonality: { type: [String]},
  verified: {
    type: Boolean,
    default: false,
  },
  isPremium: {
    type: Boolean,
    default: false,
  },
  premiumUntil: {
    type: Date,
    default: null,
  },
  googleId: {
    type: String,
    unique: true,
  },
  stripeCustomerId: {
    type: String,
  },
  onboardingComlete: {
    type: Boolean,
    default: false,
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'blocked'],
    default: 'active',
  },

}, { timestamps: true });


const User = mongoose.model("User", userSchema);

export default User;
