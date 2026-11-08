const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
const KnowledgeEmbedding = require("../models/KnowledgeEmbedding");

const KNOWLEDGE_CHUNKS = [
  {
    title: "General Information & Contact",
    category: "general",
    text: "Royal Park Hotel is located in the heart of the city at 123 Main Street. Check-in time is at 2:00 PM and check-out time is at 11:00 AM. Free high-speed Wi-Fi is available for all guests throughout the property. Contact phone: +1 (555) 123-4567. Email: info@royalparkhotel.com."
  },
  {
    title: "Check-in and Check-out Times",
    category: "policies",
    text: "At Royal Park Hotel, standard check-in time begins at 2:00 PM and check-out time is at 11:00 AM. Early check-in or late check-out is available upon request subject to room availability and may incur additional fees."
  },
  {
    title: "Hotel Amenities Overview",
    category: "amenities",
    text: "Royal Park Hotel amenities include a rooftop swimming pool open daily from 8:00 AM to 10:00 PM, a 24/7 fitness center for all guests, complimentary buffet breakfast from 6:30 AM to 10:00 AM in the main dining hall, and full spa services on the 2nd floor from 9:00 AM to 8:00 PM (reservation required)."
  },
  {
    title: "Swimming Pool & Fitness Center",
    category: "amenities",
    text: "The hotel features a rooftop swimming pool open from 8:00 AM to 10:00 PM with scenic city views. The modern fitness center is accessible 24/7 for all registered hotel guests with keycard access."
  },
  {
    title: "Breakfast & Dining",
    category: "dining",
    text: "Complimentary breakfast is served every morning from 6:30 AM to 10:00 AM in the main dining hall, offering a variety of fresh continental and hot dishes."
  },
  {
    title: "Spa & Wellness Services",
    category: "wellness",
    text: "Spa services and wellness treatments are available on the 2nd floor from 9:00 AM to 8:00 PM. Advance reservation is required for massages and treatments."
  },
  {
    title: "Room Types & Features",
    category: "rooms",
    text: "Royal Park Hotel offers three room types: Standard Room with queen-sized bed, city view, and minibar; Deluxe Room with king-sized bed, ocean view, and private balcony; Suite featuring a separate living room area, king-sized bed, premium ocean view, and complimentary wine upon arrival."
  },
  {
    title: "Standard Room Details",
    category: "rooms",
    text: "Standard Room: Accommodates up to 2 guests, includes a comfortable queen-sized bed, city view, work desk, and a stocked minibar."
  },
  {
    title: "Deluxe Room Details",
    category: "rooms",
    text: "Deluxe Room: Features a luxurious king-sized bed, stunning ocean view, private balcony, premium bathroom amenities, and high-speed Wi-Fi."
  },
  {
    title: "Suite Details",
    category: "rooms",
    text: "Suite: Includes a spacious separate living room, plush king-sized bed, panoramic ocean views, private balcony, work station, and complimentary bottle of wine upon arrival."
  },
  {
    title: "Pet Policy",
    category: "policies",
    text: "Pets are not allowed on hotel premises, with the strict exception of certified service animals with proper documentation."
  },
  {
    title: "Smoking Policy & Penalties",
    category: "policies",
    text: "Smoking is strictly prohibited inside all hotel rooms and indoor public areas. A $250 deep cleaning fee will be assessed and charged for smoking violations."
  },
  {
    title: "Cancellation & Refund Policy",
    category: "policies",
    text: "Cancellations made at least 48 hours prior to the scheduled check-in date receive a full 100% refund. Cancellations within 48 hours of check-in may be subject to a one-night fee."
  },
  {
    title: "Customer Privacy & Account Information",
    category: "privacy",
    text: "Account profiles and booking records are strictly private customer data. Signed-in customers can view their bookings and account info. Staff or AI will never disclose customer details without authentication or ask for another customer's email address."
  }
];

async function seedEmbeddings() {
  if (!process.env.MONGO_URI) {
    console.error("❌ MONGO_URI is missing in .env");
    process.exit(1);
  }

  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY is missing in .env");
    process.exit(1);
  }

  try {
    console.log("Connecting to MongoDB Atlas...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB Atlas.");

    const embeddingsModel = new GoogleGenerativeAIEmbeddings({
      model: "gemini-embedding-001",
      apiKey: process.env.GEMINI_API_KEY,
    });

    console.log("Clearing existing KnowledgeEmbedding documents...");
    await KnowledgeEmbedding.deleteMany({});

    console.log(`Generating embeddings for ${KNOWLEDGE_CHUNKS.length} knowledge chunks...`);

    for (let i = 0; i < KNOWLEDGE_CHUNKS.length; i++) {
      const chunk = KNOWLEDGE_CHUNKS[i];
      console.log(`[${i + 1}/${KNOWLEDGE_CHUNKS.length}] Embedding: "${chunk.title}"`);
      
      const vector = await embeddingsModel.embedQuery(chunk.text);

      await KnowledgeEmbedding.create({
        title: chunk.title,
        category: chunk.category,
        text: chunk.text,
        embedding: vector,
        metadata: {
          chunkIndex: i,
          source: "hotel_knowledge.txt",
          dimensions: vector.length,
        },
      });
    }

    const count = await KnowledgeEmbedding.countDocuments();
    console.log(`\nSuccessfully stored ${count} embeddings in MongoDB Atlas ('knowledgeembeddings' collection)!`);
    console.log("Embedding dimension size: 3072");

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding error:", error);
    process.exit(1);
  }
}

seedEmbeddings();

