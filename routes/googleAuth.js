require("dotenv").config();
const express = require("express");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const jwt = require("jsonwebtoken");

const router = express.Router();

/* =========================
   PASSPORT CONFIG
========================= */
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "http://localhost:5000/api/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      return done(null, profile);
    }
  )
);

/* =========================
   ROUTES
========================= */

// STEP 1 → Google Login
router.get(
  "/",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// STEP 2 → Google Callback
router.get(
  "/callback",
  passport.authenticate("google", { session: false }),
  (req, res) => {
    const token = jwt.sign(
      {
        email: req.user.emails[0].value,
        name: req.user.displayName,
        googleId: req.user.id,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    // Redirect to frontend with token
    res.redirect(`${process.env.CLIENT_URL}/?token=${token}`);
  }
);

module.exports = router;
