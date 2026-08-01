const User = require("../models/User");

// LOCAL REGISTER
exports.register = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ message: "Email already registered" });
    }

    await User.create({
      name,
      email,
      phone,
      password,
      provider: "local",
    });

    res.status(201).json({ message: "Registration successful" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// LOCAL LOGIN
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email, provider: "local" }).select("+password");
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    res.json({
      message: "Login successful",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
