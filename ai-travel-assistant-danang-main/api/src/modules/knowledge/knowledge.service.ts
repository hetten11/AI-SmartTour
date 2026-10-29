import { readFile } from "node:fs/promises";
import path from "node:path";
import { embed, toVectorLiteral } from "../../common/llm.ts";
import { prisma } from "../../config/prisma.ts";

export type KnowledgeHit = {
  id: string;
  title: string | null;
  content: string;
  sourceType: string;
  placeId: string | null;
  eventId: string | null;
  distance: number;
};

type ChunkInput = {
  sourceType: "place" | "event" | "article" | "policy";
  placeId: string | null;
  eventId: string | null;
  title: string;
  content: string;
};

type Policy = { id: string; title: string; content: string; tags?: string[] };

// Prisma không hỗ trợ type vector nên phải ghi bằng SQL thô.
const insertChunk = async (chunk: ChunkInput) => {
  const vector = await embed(`${chunk.title}\n${chunk.content}`);
  await prisma.$executeRaw`
    INSERT INTO "knowledge_chunks"
      ("id", "source_type", "place_id", "event_id", "title", "content", "embedding", "is_active", "created_at", "updated_at")
    VALUES
      (gen_random_uuid(), ${chunk.sourceType}::"chunk_source", ${chunk.placeId}::uuid, ${chunk.eventId}::uuid,
       ${chunk.title}, ${chunk.content}, ${toVectorLiteral(vector)}::vector, true, now(), now())
  `;
};

const readPolicies = async (): Promise<Policy[]> => {
  const filePath = path.resolve(process.cwd(), "prisma/data/policies.json");
  const payload: unknown = JSON.parse(await readFile(filePath, "utf8"));
  return Array.isArray(payload) ? (payload as Policy[]) : [];
};

// ponytail: mỗi bản ghi một chunk và gọi embedding tuần tự. Cắt nhỏ và chạy song
// song có giới hạn khi dữ liệu lên hàng nghìn bản ghi.
export const reindexAll = async () => {
  await prisma.$executeRaw`DELETE FROM "knowledge_chunks"`;

  const places = await prisma.place.findMany({
    where: { isActive: true },
    select: { id: true, name: true, category: true, description: true, address: true, district: true, tags: true },
  });
  const events = await prisma.event.findMany({
    where: { isActive: true },
    select: { id: true, title: true, description: true, venue: true, address: true, startAt: true, tags: true },
  });
  const policies = await readPolicies();

  for (const place of places) {
    const content = [
      `Loại: ${place.category}`,
      place.district ? `Khu vực: ${place.district}` : "",
      place.address ? `Địa chỉ: ${place.address}` : "",
      place.tags.length > 0 ? `Thẻ: ${place.tags.join(", ")}` : "",
      place.description ?? "",
    ]
      .filter(Boolean)
      .join("\n");
    await insertChunk({
      sourceType: "place",
      placeId: place.id,
      eventId: null,
      title: place.name,
      content,
    });
  }

  for (const event of events) {
    const content = [
      `Thời gian: ${event.startAt.toISOString()}`,
      event.venue ? `Địa điểm: ${event.venue}` : "",
      event.address ? `Địa chỉ: ${event.address}` : "",
      event.tags.length > 0 ? `Thẻ: ${event.tags.join(", ")}` : "",
      event.description ?? "",
    ]
      .filter(Boolean)
      .join("\n");
    await insertChunk({
      sourceType: "event",
      placeId: null,
      eventId: event.id,
      title: event.title,
      content,
    });
  }

  for (const policy of policies) {
    await insertChunk({
      sourceType: "policy",
      placeId: null,
      eventId: null,
      title: policy.title,
      content: policy.content,
    });
  }

  return { places: places.length, events: events.length, policies: policies.length };
};

export const searchKnowledge = async (query: string, limit = 5): Promise<KnowledgeHit[]> => {
  // Truy vấn tìm kiếm dùng task RETRIEVAL_QUERY, lúc đánh chỉ mục dùng
  // RETRIEVAL_DOCUMENT; Gemini tính vector khác nhau cho hai việc này.
  const vector = toVectorLiteral(await embed(query, "RETRIEVAL_QUERY"));
  return prisma.$queryRaw<KnowledgeHit[]>`
    SELECT "id", "title", "content", "source_type" AS "sourceType",
           "place_id" AS "placeId", "event_id" AS "eventId",
           ("embedding" <=> ${vector}::vector) AS "distance"
    FROM "knowledge_chunks"
    WHERE "is_active" = true AND "embedding" IS NOT NULL
    ORDER BY "embedding" <=> ${vector}::vector
    LIMIT ${limit}
  `;
};
