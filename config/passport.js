// config/passport.js
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import dotenv from "dotenv";
import User from "../models/user.js";
import jwt from "jsonwebtoken"; // ✅ ADD JWT

dotenv.config();

// ✅ Generate JWT Token function
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user._id, 
      email: user.email 
    },
    process.env.JWT_SECRET || 'your-fallback-secret',
    { expiresIn: '7d' }
  );
};

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
      scope: ["profile", "email"]
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        console.log("Google Profile:", profile);
        
        // Find or create user in DB
        let user = await User.findOne({ 
          $or: [
            { googleId: profile.id },
            { email: profile.emails?.[0]?.value }
          ]
        });

        if (!user) {
          user = await User.create({
            googleId: profile.id,
            username: profile.displayName,
            email: profile.emails?.[0]?.value,
            avatar: profile.photos?.[0]?.value,
          });
        } else {
          // Update existing user with Google ID if not present
          if (!user.googleId) {
            user.googleId = profile.id;
            await user.save();
          }
        }

        // ✅ Generate JWT token for the user
        const token = generateToken(user);
        user.token = token; // Attach token to user object
        
        return done(null, user);
      } catch (error) {
        console.error("Passport Google Strategy Error:", error);
        return done(error, null);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

export default passport;