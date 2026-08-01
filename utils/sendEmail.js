const nodemailer = require("nodemailer");

// ⚡ Create transporter
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // TLS
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // Must be Gmail App Password
  },
  tls: {
    rejectUnauthorized: false, // fix Gmail TLS issues in dev
  },
});

// ⚡ Send email function
const sendEmail = async ({ to, subject, html }) => {
  if (!to) throw new Error("Email recipient is missing");

  try {
    const info = await transporter.sendMail({
      from: `"RoyalPark Hotel" <${process.env.EMAIL_USER}>`,
      to: to.trim(), // ✅ trim whitespace
      subject: subject || "RoyalPark Notification",
      html,
      text: html.replace(/<[^>]*>?/gm, ""), // fallback: strip HTML tags
    });

    console.log("✅ Email sent to", to, "| MessageId:", info.messageId);
  } catch (error) {
    console.error("❌ Email send failed:", error.message);
    throw new Error("Email not sent");
  }
};

module.exports = sendEmail;
