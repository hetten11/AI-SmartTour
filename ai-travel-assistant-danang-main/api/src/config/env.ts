const nodeEnv = process.env.NODE_ENV ?? "development";

export const env = {
  port: Number(process.env.PORT ?? 8000),
  nodeEnv,
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  databaseUrl: process.env.DATABASE_URL,
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS ?? 30),
  accessTtlMinutes: Number(process.env.ACCESS_TTL_MINUTES ?? 15),
  cookieSecure: nodeEnv === "production",
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiBaseUrl: (
    process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta"
  ).replace(/\/$/, ""),
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  geminiEmbeddingModel: process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001",
  // Phải khớp cột knowledge_chunks.embedding (vector(1536) trong migration init).
  embeddingDim: Number(process.env.EMBEDDING_DIM ?? 1536),
} as const;
