const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/User");

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${BACKEND_URL}/api/auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;

        let user = await User.findOne({ email });

        if (user) {
          // Link Google account if not already linked
          if (!user.googleId) {
            user.googleId = profile.id;
            user.provider = "google";
            await user.save();
          }
        } else {
          // Create new Google user (NO password, NO phone)
          user = await User.create({
            name: profile.displayName || "Google User",
            email,
            googleId: profile.id,
            provider: "google",
            role: "user",
          });
        }

        done(null, user);
      } catch (err) {
        done(err, null);
      }
    }
  )
);

// Serialize/deserialize for session support
passport.serializeUser((user, done) => {
  done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id).select('-password');
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

module.exports = passport;
