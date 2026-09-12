const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { DynamicTool } = require("@langchain/core/tools");
const { createReactAgent } = require("@langchain/langgraph/prebuilt");

const Booking = require("../models/Booking");

let agent = null;

async function initAgent() {
    try {
        console.log("Initializing Agentic RAG system with LangGraph...");
        
        if (!process.env.GEMINI_API_KEY) {
            console.warn("GEMINI_API_KEY is not set. Agent system will not initialize.");
            return;
        }

        // 1. Load Knowledge Base
        const filePath = path.join(__dirname, '../data/hotel_knowledge.txt');
        let text = "";
        if (fs.existsSync(filePath)) {
            text = fs.readFileSync(filePath, 'utf8');
        } else {
            console.warn("Knowledge base file not found at", filePath);
        }

        const retrieverTool = new DynamicTool({
            name: "search_hotel_information",
            description: "Searches and returns information about the Royal Park Hotel's policies, amenities, and general FAQ.",
            func: async () => text
        });

        // 2. Define Action Tools
        const checkAvailabilityTool = new DynamicTool({
            name: "check_room_availability",
            description: "Use this to check if there are rooms available for specific dates. Input must be a valid JSON string with keys: 'checkIn' (YYYY-MM-DD) and 'checkOut' (YYYY-MM-DD). Optional keys: 'roomType' (String), 'guests' (Number). Example: {\"checkIn\": \"2026-09-19\", \"checkOut\": \"2026-09-21\"}",
            func: async (inputStr) => {
                try {
                    const args = JSON.parse(inputStr);
                    if (!args.checkIn || !args.checkOut) return "Error: checkIn and checkOut dates are required.";
                    
                    const queryParams = new URLSearchParams(args).toString();
                    const port = process.env.PORT || 5000;
                    
                    const res = await fetch(`http://127.0.0.1:${port}/api/rooms/available?${queryParams}`);
                    if (!res.ok) return "Error fetching availability.";
                    
                    const rooms = await res.json();
                    if (rooms.length === 0) return "No rooms available for those dates.";
                    
                    return JSON.stringify(rooms.map(r => ({
                        title: r.title,
                        roomType: r.roomType,
                        availableRooms: r.availableRooms,
                        capacity: r.capacity
                    })));
                } catch (err) {
                    return `Error executing tool: ${err.message}`;
                }
            }
        });

        const lookupBookingTool = new DynamicTool({
            name: "lookup_guest_booking",
            description: "Use this to check the status of a guest's booking. Input must be the guest's email address as a plain string.",
            func: async (email) => {
                try {
                    if (!email || !email.includes('@')) return "Error: valid email address required.";
                    
                    const bookings = await Booking.find({ email: email.trim() }).sort({ createdAt: -1 }).limit(5);
                    if (!bookings || bookings.length === 0) return "No bookings found for that email.";
                    
                    return JSON.stringify(bookings.map(b => ({
                        roomTitle: b.roomTitle,
                        checkIn: b.checkIn,
                        checkOut: b.checkOut,
                        status: b.bookingStatus,
                        amount: b.totalAmount
                    })));
                } catch (err) {
                    return `Error looking up booking: ${err.message}`;
                }
            }
        });

        const tools = [retrieverTool, checkAvailabilityTool, lookupBookingTool];

        // 3. Create the Chat Model
        const llm = new ChatGoogleGenerativeAI({
            model: "gemini-3.8-flash",
            apiKey: process.env.GEMINI_API_KEY,
            temperature: 0,
        });

        // 4. Build Agent using LangGraph
        agent = createReactAgent({
            llm,
            tools,
            stateModifier: "You are a helpful and polite virtual concierge for the Royal Park Hotel. Answer the user's questions based on the tools available. If a user asks for available rooms, always use the check_room_availability tool. If they ask about their booking, ask for their email and use the lookup_guest_booking tool. Do not hallucinate data."
        });

        console.log("Agent system initialized successfully.");
    } catch (error) {
        console.error("Error initializing Agent:", error);
    }
}

initAgent();

router.post('/', async (req, res) => {
    try {
        const { message } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: "Message is required" });
        }

        if (!process.env.GEMINI_API_KEY) {
             return res.status(500).json({ error: "Gemini API key is not configured on the server." });
        }

        if (!agent) {
            await initAgent();
            if (!agent) {
                return res.status(500).json({ error: "Agent system is still initializing or failed to start." });
            }
        }

        const response = await agent.invoke({
            messages: [{ role: "user", content: message }]
        });

        const finalMessage = response.messages[response.messages.length - 1];

        res.json({ reply: finalMessage.content });
    } catch (error) {
        console.error("Chatbot Agent Error:", error);
        res.status(500).json({ error: "An error occurred while communicating with the AI." });
    }
});

module.exports = router;
