const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
const KnowledgeEmbedding = require("../models/KnowledgeEmbedding");

let embeddingsModel = null;

function getEmbeddingsModel() {
  if (!embeddingsModel) {
    embeddingsModel = new GoogleGenerativeAIEmbeddings({
      model: "gemini-embedding-001",
      apiKey: process.env.GEMINI_API_KEY,
    });
  }
  return embeddingsModel;
}

function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dot = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dot / magnitude;
}

/**
 * Searches hotel knowledge using MongoDB Atlas Vector Search,
 * with fallback to exact cosine similarity if the Atlas Search index
 * has not yet been built in the Atlas dashboard.
 */
async function searchKnowledge(query, limit = 3) {
  if (!query || typeof query !== "string") {
    return [];
  }

  const model = getEmbeddingsModel();
  const queryVector = await model.embedQuery(query);

  // 1. Try MongoDB Atlas native $vectorSearch aggregation
  try {
    const atlasResults = await KnowledgeEmbedding.aggregate([
      {
        $vectorSearch: {
          index: "hotel_vector_index",
          path: "embedding",
          queryVector: queryVector,
          numCandidates: 15,
          limit: limit,
        },
      },
      {
        $project: {
          _id: 0,
          title: 1,
          category: 1,
          text: 1,
          score: { $meta: "vectorSearchScore" },
        },
      },
    ]);

    if (atlasResults && atlasResults.length > 0) {
      return atlasResults;
    }
  } catch (atlasErr) {
    // Atlas index may not be created yet in the Atlas Web UI
    // Fall back to stored embeddings with cosine similarity
    console.warn("ℹ️ Atlas $vectorSearch unavailable (index 'hotel_vector_index' may be pending). Using MongoDB stored vector similarity fallback.");
  }

  // 2. Fallback: Retrieve embeddings stored in MongoDB and compute similarity
  const allDocs = await KnowledgeEmbedding.find({}, "title category text embedding").lean();
  if (!allDocs || allDocs.length === 0) {
    return [];
  }

  const scoredDocs = allDocs
    .map((doc) => ({
      title: doc.title,
      category: doc.category,
      text: doc.text,
      score: cosineSimilarity(queryVector, doc.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scoredDocs;
}

module.exports = {
  searchKnowledge,
  cosineSimilarity,
  getEmbeddingsModel,
};

