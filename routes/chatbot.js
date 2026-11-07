const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { DynamicTool } = require("@langchain/core/tools");
const { createReactAgent } = require("@langchain/langgraph/prebuilt");

const Booking = require("../models/Booking");
const User = require("../models/User");

let llm = null;

// Optional authentication middleware:
// Allows guests to chat freely, while authenticating logged-in users to access their bookings.
// If a token is expired or invalid, it gracefully falls back to guest mode rather than rejecting with 401.
const optionalAuth = (req, res, next) => {
    try {
        // 1. Session login (user session only, not staff)
        if (req.session?.user && !req.session.staff) {
            const s = req.session.user;
            req.user = {
                userId: s.id || s._id,
                role: s.role || "user",
            };
            return next();
        }

        // 2. JWT token login (optional)
        const authHeader = req.headers.authorization;
        if (authHeader && typeof authHeader === "string") {
            // Strip any "Bearer " prefixes (including case-insensitive, repeated "Bearer Bearer ...", extra whitespace)
            let token = authHeader.trim();
            while (token.toLowerCase().startsWith("bearer ")) {
                token = token.slice(7).trim();
            }

            // Strip surrounding quotes if any (e.g. "eyJ..." or 'eyJ...')
            if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
                token = token.slice(1, -1).trim();
            }

            // Only attempt verification if token strictly matches 3-part base64url JWT structure
            const parts = token.split('.');
            const base64UrlPattern = /^[A-Za-z0-9_-]+$/;

            if (
                token &&
                token !== "null" &&
                token !== "undefined" &&
                token !== "session" &&
                parts.length === 3 &&
                base64UrlPattern.test(parts[0]) &&
                base64UrlPattern.test(parts[1]) &&
                base64UrlPattern.test(parts[2])
            ) {
                try {
                    const decoded = jwt.verify(token, process.env.JWT_SECRET);
                    if (!decoded.staffId) {
                        req.user = {
                            userId: decoded.userId || decoded.id,
                            role: decoded.role || "user",
                        };
                    }
                } catch (jwtErr) {
                    if (jwtErr.name === 'TokenExpiredError') {
                        console.log("ℹ️ Chatbot: User token expired, continuing as guest");
                    } else {
                        console.warn("⚠️ Chatbot: Token verification failed, continuing as guest:", jwtErr.message);
                    }
                }
            }
        }
    } catch (err) {
        console.warn("⚠️ Chatbot optionalAuth error:", err.message);
    }
    next();
};

function createTools(userId) {
    const filePath = path.join(__dirname, '../data/hotel_knowledge.txt');
    const text = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : "";
    if (!text) {
        console.warn("Hotel knowledge base is missing or empty at", filePath);
    }

    const tools = [
        new DynamicTool({
            name: "search_hotel_information",
            description: "Searches information about the Royal Park Hotel's policies, amenities, and general FAQ.",
            func: async () => text || "Hotel information is currently unavailable."
        }),
        new DynamicTool({
            name: "check_room_availability",
            description: "Checks room availability. Input must be a JSON string with checkIn and checkOut in YYYY-MM-DD format; optional roomType and guests. Example: {\"checkIn\":\"2026-09-19\",\"checkOut\":\"2026-09-21\"}.",
            func: async (inputStr) => {
                try {
                    const args = JSON.parse(inputStr);
                    if (!args.checkIn || !args.checkOut) return "Error: checkIn and checkOut dates are required.";

                    const queryParams = new URLSearchParams(args).toString();
                    const port = process.env.PORT || 5000;
                    const response = await fetch(`http://127.0.0.1:${port}/api/rooms/available?${queryParams}`);
                    if (!response.ok) return "Error fetching availability.";

                    const rooms = await response.json();
                    if (rooms.length === 0) return "No rooms available for those dates.";

                    return JSON.stringify(rooms.map(room => ({
                        title: room.title,
                        roomType: room.roomType,
                        availableRooms: room.availableRooms,
                        capacity: room.capacity
                    })));
                } catch (error) {
                    return `Error checking availability: ${error.message}`;
                }
            }
        })
    ];

    if (userId) {
        tools.push(new DynamicTool({
            name: "lookup_my_bookings",
            description: "Retrieves the signed-in customer's own profile and recent bookings. Use this when they ask about their account or booking; it takes no email or other identifying input.",
            func: async () => {
                try {
                    const user = await User.findById(userId).select("name email phone");
                    if (!user) return "The signed-in customer account could not be found.";

                    const bookings = await Booking.find({
                        $or: [{ userId: user._id }, { email: user.email }]
                    })
                        .select("roomTitle checkIn checkOut bookingStatus paymentStatus totalAmount")
                        .sort({ createdAt: -1 })
                        .limit(5)
                        .lean();

                    return JSON.stringify({
                        customer: {
                            name: user.name,
                            email: user.email,
                            phone: user.phone
                        },
                        bookings: bookings.map(booking => ({
                            room: booking.roomTitle,
                            checkIn: booking.checkIn,
                            checkOut: booking.checkOut,
                            status: booking.bookingStatus,
                            paymentStatus: booking.paymentStatus,
                            totalAmount: booking.totalAmount
                        }))
                    });
                } catch (error) {
                    console.error("Chatbot booking lookup error:", error);
                    return "I could not retrieve your bookings right now.";
                }
            }
        }));
    }

    return tools;
}

function createAgent(userId) {
    if (!llm) {
        llm = new ChatGoogleGenerativeAI({
            model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
            apiKey: process.env.GEMINI_API_KEY,
            temperature: 0,
        });
    }

    return createReactAgent({
        llm,
        tools: createTools(userId),
        stateModifier: userId
            ? "You are a helpful and polite virtual concierge for the Royal Park Hotel. Answer hotel questions using the available tools. Always use check_room_availability for live availability and lookup_my_bookings for the signed-in customer's profile or booking questions. Only discuss personal data returned by that tool. Never ask for or look up another person's email. If a tool has no information, say so; do not hallucinate."
            : "You are a helpful and polite virtual concierge for the Royal Park Hotel. Answer hotel questions using the available tools. Always use check_room_availability for live availability. Personal account and booking details are private and unavailable until the customer signs in; ask them to sign in to view them. Do not request an email address or attempt to look up another person's details. Do not hallucinate."
    });
}

router.post('/', optionalAuth, async (req, res) => {
    try {
        const { message } = req.body;
        
        if (typeof message !== "string" || !message.trim()) {
            return res.status(400).json({ error: "Message is required" });
        }

        if (!process.env.GEMINI_API_KEY) {
             return res.status(500).json({ error: "Gemini API key is not configured on the server." });
        }

        const userId = req.user?.role === "user" ? req.user.userId : null;
        const agent = createAgent(userId);

        const response = await agent.invoke({
            messages: [{ role: "user", content: message.trim() }]
        });

        const finalMessage = response.messages[response.messages.length - 1];

        let replyText = "";
        if (typeof finalMessage.content === "string") {
            replyText = finalMessage.content;
        } else if (Array.isArray(finalMessage.content)) {
            replyText = finalMessage.content
                .filter(part => part.type === "text")
                .map(part => part.text)
                .join("\n");
        } else {
            replyText = JSON.stringify(finalMessage.content);
        }

        res.json({ reply: replyText });
    } catch (error) {
        console.error("Chatbot Agent Error:", error);
        res.status(500).json({ error: "An error occurred while communicating with the AI." });
    }
});

module.exports = router;
