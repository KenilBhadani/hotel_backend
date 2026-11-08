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
const RoomListing = require("../models/RoomListing");
const RoomInstance = require("../models/RoomInstance");
const { searchKnowledge } = require("../utils/vectorSearch");

let llm = null;

// Optional authentication middleware
const optionalAuth = (req, res, next) => {
    try {
        if (req.session?.user && !req.session.staff) {
            const s = req.session.user;
            req.user = {
                userId: s.id || s._id,
                role: s.role || "user",
            };
            return next();
        }

        const authHeader = req.headers.authorization;
        if (authHeader && typeof authHeader === "string") {
            let token = authHeader.trim();
            while (token.toLowerCase().startsWith("bearer ")) {
                token = token.slice(7).trim();
            }

            if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
                token = token.slice(1, -1).trim();
            }

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
                    if (jwtErr.name !== 'TokenExpiredError') {
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

/**
 * Fast direct availability calculation against MongoDB models
 */
async function checkAvailabilityDirectly({ checkIn, checkOut, roomType, guests }) {
    if (!checkIn || !checkOut) {
        return "Error: checkIn and checkOut dates are required in YYYY-MM-DD format.";
    }

    const currentYear = new Date().getFullYear();
    let checkInDate = new Date(checkIn);
    let checkOutDate = new Date(checkOut);

    if (isNaN(checkInDate.getTime())) {
        checkInDate = new Date(`${checkIn} ${currentYear}`);
    }
    if (isNaN(checkOutDate.getTime())) {
        checkOutDate = new Date(`${checkOut} ${currentYear}`);
    }

    if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime()) || checkInDate >= checkOutDate) {
        return "Invalid date range. Check-out date must be strictly after check-in date.";
    }

    const roomQuery = { status: "active" };
    if (roomType && typeof roomType === "string" && roomType.trim()) {
        roomQuery.roomType = new RegExp(`^${roomType.trim()}$`, "i");
    }
    if (guests && Number(guests)) {
        roomQuery.capacity = { $gte: Number(guests) };
    }

    const rooms = await RoomListing.find(roomQuery).lean();
    if (!rooms || rooms.length === 0) {
        return "No rooms match your criteria.";
    }

    const overlappingBookings = await Booking.aggregate([
        {
            $match: {
                bookingStatus: { $nin: ["Cancelled", "Checked-out"] },
                checkIn: { $lt: checkOutDate },
                checkOut: { $gt: checkInDate },
            },
        },
        {
            $group: {
                _id: "$roomId",
                bookedCount: { $sum: 1 },
            },
        },
    ]);
    const bookingMap = {};
    overlappingBookings.forEach(b => { bookingMap[b._id.toString()] = b.bookedCount; });

    const nights = Math.max(1, Math.round((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24)));
    const availableList = [];

    for (const room of rooms) {
        const bookedCount = bookingMap[room._id.toString()] || 0;
        const unavailableInstances = await RoomInstance.countDocuments({
            roomListing: room._id,
            status: { $in: ["DIRTY", "CLEANING", "MAINTENANCE", "STAY", "REVIEW"] }
        });
        const physicallyAvailable = room.totalRooms - unavailableInstances;
        const availableCount = Math.max(0, physicallyAvailable - bookedCount);

        if (availableCount > 0) {
            const standardRate = room.pricing?.standardRate || (room.roomType === "Deluxe" ? 5000 : 3000);
            availableList.push({
                title: room.title,
                roomType: room.roomType,
                availableRooms: availableCount,
                capacity: room.capacity,
                pricePerNight: `₹${standardRate.toLocaleString('en-IN')}`,
                stayNights: nights,
                totalStayPrice: `₹${(standardRate * nights).toLocaleString('en-IN')}`,
                amenities: room.amenities
            });
        }
    }

    if (availableList.length === 0) {
        return "No rooms are available for those specific dates.";
    }

    return JSON.stringify(availableList);
}

function createTools(userId) {
    const filePath = path.join(__dirname, '../data/hotel_knowledge.txt');
    const fallbackText = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : "";

    const tools = [
        new DynamicTool({
            name: "search_hotel_information",
            description: "Searches information about the Royal Park Hotel's policies, amenities, timings, room features, and general FAQ using semantic vector search in MongoDB Atlas. Input should be the topic or question string (e.g. 'breakfast timing' or 'pet policy').",
            func: async (input) => {
                try {
                    const query = typeof input === "string" ? input : "";
                    const results = await searchKnowledge(query || "hotel amenities policies general information", 4);
                    if (results && results.length > 0) {
                        return results.map(r => `[${r.title}]: ${r.text}`).join("\n\n");
                    }
                    return fallbackText || "Hotel information is currently unavailable.";
                } catch (err) {
                    console.error("Chatbot vector search retrieval error:", err);
                    return fallbackText || "Hotel information is currently unavailable.";
                }
            }
        }),
        new DynamicTool({
            name: "get_room_rates",
            description: "Retrieves standard nightly room rates and pricing for all room types when no dates are specified (e.g. when the guest asks 'what are the prices?', 'how much for a room?'). Takes no input.",
            func: async () => {
                try {
                    const rooms = await RoomListing.find({ status: "active" }).select("title roomType pricing capacity amenities").lean();
                    if (!rooms || rooms.length === 0) {
                        return "Standard Room is ₹3,000 per night. Deluxe Room is ₹5,000 per night.";
                    }
                    return JSON.stringify(rooms.map(r => ({
                        title: r.title,
                        roomType: r.roomType,
                        pricePerNight: `₹${(r.pricing?.standardRate || (r.roomType === 'Deluxe' ? 5000 : 3000)).toLocaleString('en-IN')}/night`,
                        capacity: r.capacity,
                        amenities: r.amenities
                    })));
                } catch (e) {
                    return "Standard Room is ₹3,000 per night. Deluxe Room is ₹5,000 per night.";
                }
            }
        }),
        new DynamicTool({
            name: "check_room_availability",
            description: "Checks real-time room availability and calculates exact total pricing for a stay. Input must be a JSON string with checkIn and checkOut in YYYY-MM-DD format (e.g. {\"checkIn\":\"2026-11-10\",\"checkOut\":\"2026-11-12\"}).",
            func: async (inputStr) => {
                try {
                    const args = typeof inputStr === "string" ? JSON.parse(inputStr) : inputStr;
                    return await checkAvailabilityDirectly(args);
                } catch (error) {
                    return `Error checking availability: ${error.message}`;
                }
            }
        })
    ];

    if (userId) {
        tools.push(new DynamicTool({
            name: "lookup_my_bookings",
            description: "Retrieves the signed-in customer's own profile and recent bookings. Use this when they ask about their account or booking; it takes no input.",
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
            model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
            apiKey: process.env.GEMINI_API_KEY,
            temperature: 0.1,
        });
    }

    const currentDateStr = new Date().toISOString().slice(0, 10);
    const basePrompt = `You are a helpful and polite virtual concierge for the Royal Park Hotel.
Today's date reference: ${currentDateStr} (Year 2026).

CRITICAL CONVERSATIONAL RULES:
1. CONVERSATION MEMORY: Maintain full conversational context. If the guest previously gave check-in/check-out dates (like Nov 10 to Nov 12), specific rooms, or guest counts in prior turns, NEVER ask them to repeat the dates. Always remember and apply them to follow-up questions.
2. PRICING: When asked "what are their price", "give price", or "how much", quote the exact prices.
   - Deluxe Room: ₹5,000 per night
   - Standard Room: ₹3,000 per night
   If dates were already discussed (e.g. 2 nights), multiply and state the total cost for the stay (e.g., "For 2 nights: Deluxe Room is ₹10,000 total (₹5,000/night); Standard Room is ₹6,000 total (₹3,000/night)").
3. DATES: If the guest says "from 10 to 12 for 3 days" or "10 november to 12 november", associate with the year 2026. Do NOT guess random months like May if November was mentioned.
4. CLEAN FORMATTING: Speak naturally and professionally. Use bold text (**name**) cleanly and sparingly. Never output consecutive asterisks like **** or raw formatting artifacts. Use clean bullet points.`;

    const stateModifier = userId
        ? `${basePrompt}\nAlways use check_room_availability for live availability and lookup_my_bookings for the signed-in customer's profile or booking questions. Only discuss personal data returned by that tool.`
        : `${basePrompt}\nPersonal account and booking details are private and unavailable until the customer signs in; ask them to sign in to view them.`;

    return createReactAgent({
        llm,
        tools: createTools(userId),
        stateModifier
    });
}

router.post('/', optionalAuth, async (req, res) => {
    try {
        const { message, history } = req.body;
        
        if (typeof message !== "string" || !message.trim()) {
            return res.status(400).json({ error: "Message is required" });
        }

        if (!process.env.GEMINI_API_KEY) {
             return res.status(500).json({ error: "Gemini API key is not configured on the server." });
        }

        const userId = req.user?.role === "user" ? req.user.userId : null;
        const agent = createAgent(userId);

        // Build conversation messages including recent history for context continuity
        const conversationMessages = [];
        if (Array.isArray(history)) {
            for (const item of history.slice(-8)) {
                if (item && typeof item.content === "string" && item.content.trim()) {
                    const role = item.role === "assistant" ? "assistant" : "user";
                    conversationMessages.push({ role, content: item.content.trim() });
                }
            }
        }
        conversationMessages.push({ role: "user", content: message.trim() });

        const response = await agent.invoke({
            messages: conversationMessages
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
