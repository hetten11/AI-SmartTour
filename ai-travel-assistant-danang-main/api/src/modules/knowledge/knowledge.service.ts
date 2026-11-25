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

// Ghi chunk vào DB an toàn: nếu gọi API Embedding bị chạm giới hạn Quota (429)
// thì vẫn lưu đầy đủ nội dung văn bản (embedding = NULL) để bộ tìm kiếm từ khóa dự phòng hoạt động.
const insertChunk = async (chunk: ChunkInput) => {
  try {
    const vector = await embed(`${chunk.title}\n${chunk.content}`);
    await prisma.$executeRaw`
      INSERT INTO "knowledge_chunks"
        ("id", "source_type", "place_id", "event_id", "title", "content", "embedding", "is_active", "created_at", "updated_at")
      VALUES
        (gen_random_uuid(), ${chunk.sourceType}::"chunk_source", ${chunk.placeId}::uuid, ${chunk.eventId}::uuid,
         ${chunk.title}, ${chunk.content}, ${toVectorLiteral(vector)}::vector, true, now(), now())
    `;
  } catch {
    await prisma.$executeRaw`
      INSERT INTO "knowledge_chunks"
        ("id", "source_type", "place_id", "event_id", "title", "content", "embedding", "is_active", "created_at", "updated_at")
      VALUES
        (gen_random_uuid(), ${chunk.sourceType}::"chunk_source", ${chunk.placeId}::uuid, ${chunk.eventId}::uuid,
         ${chunk.title}, ${chunk.content}, NULL, true, now(), now())
    `;
  }
};

const readPolicies = async (): Promise<Policy[]> => {
  const filePath = path.resolve(process.cwd(), "prisma/data/policies.json");
  const payload: unknown = JSON.parse(await readFile(filePath, "utf8"));
  return Array.isArray(payload) ? (payload as Policy[]) : [];
};

export const reindexAll = async () => {
  const places = await prisma.place.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      category: true,
      description: true,
      address: true,
      district: true,
      estimatedCostVnd: true,
      isSponsored: true,
      sponsorTier: true,
      tags: true,
    },
  });
  const events = await prisma.event.findMany({
    where: { isActive: true },
    select: {
      id: true,
      title: true,
      description: true,
      venue: true,
      address: true,
      startAt: true,
      endAt: true,
      tags: true,
    },
  });
  const policies = await readPolicies();

  // Xoá các chunk cũ và nạp lại tuần tự (với cơ chế bảo vệ text-fallback ở insertChunk)
  await prisma.$executeRaw`DELETE FROM "knowledge_chunks"`;

  for (const policy of policies) {
    await insertChunk({
      sourceType: "policy",
      placeId: null,
      eventId: null,
      title: policy.title,
      content: policy.content,
    });
  }

  for (const place of places) {
    const content = [
      `Loại: ${place.category}`,
      place.isSponsored ? `Đối tác F&B Đề xuất (${place.sponsorTier ?? "gold"})` : "",
      place.district ? `Khu vực: ${place.district}` : "",
      place.address ? `Địa chỉ: ${place.address}` : "",
      place.estimatedCostVnd !== null ? `Chi phí dự kiến: ${place.estimatedCostVnd} VNĐ/người` : "",
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
      `Bắt đầu: ${event.startAt.toISOString()}`,
      event.endAt ? `Kết thúc: ${event.endAt.toISOString()}` : "",
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

  return { places: places.length, events: events.length, policies: policies.length };
};

// Danh sách hư từ & từ hỏi tiếng Việt thường gặp trong câu hỏi chat để giữ lại đúng tên địa danh/chủ đề chính
const STOP_WORDS = new Set([
  "ở",
  "tại",
  "đà",
  "nẵng",
  "quảng",
  "nam",
  "thành",
  "phố",
  "khu",
  "vực",
  "quận",
  "huyện",
  "xã",
  "phường",
  "có",
  "gì",
  "nào",
  "đâu",
  "đi",
  "chơi",
  "vui",
  "cho",
  "tôi",
  "mình",
  "bạn",
  "ơi",
  "hỏi",
  "về",
  "là",
  "và",
  "hay",
  "những",
  "các",
  "nhé",
  "nha",
  "ạ",
  "không",
  "mới",
  "cũ",
  "nổi",
  "bật",
  "tiếng",
  "nhất",
  "đẹp",
  "ngon",
  "hấp",
  "dẫn",
  "thú",
  "vị",
  "đặc",
  "sắc",
  "biet",
  "biệt",
  "hot",
  "hit",
  "trend",
  "review",
  "lịch",
  "sử",
  "ngày",
  "năm",
  "tháng",
  "thời",
  "gian",
  "thành",
  "lập",
  "xây",
  "dựng",
  "khánh",
  "hình",
  "nguồn",
  "gốc",
  "ai",
  "khi",
  "bao",
  "giờ",
  "lâu",
  "nhiêu",
  "kiến",
  "trúc",
  "nên",
  "cần",
  "muốn",
  "tìm",
  "kiếm",
  "gợi",
  "ý",
  "giới",
  "thiệu",
  "xem",
  "biết",
  "thông",
  "tin",
  "chi",
  "tiết",
  "cụ",
  "thể",
  "thánh",
  "địa",
  "khu",
  "đền",
  "tháp",
  "phố",
  "cổ",
  "điểm",
  "danh",
  "lam",
  "thắng",
  "cảnh",
  "chỗ",
  "nơi",
  "tham",
  "quan",
  "du",
  "như",
  "thế",
  "sao",
  "vậy",
  "thì",
  "mà",
  "của",
  "trong",
  "ngoài",
  "gần",
  "đây",
  "đó",
  "được",
]);

export const extractCleanSearchPhrase = (rawQuery: string): string => {
  const cleaned = rawQuery
    .toLowerCase()
    .replace(/[?!.,;:"]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w))
    .join(" ")
    .trim();
  return cleaned || rawQuery.trim();
};

// Tìm kiếm từ khóa dự phòng (Fallback ILIKE) khi API Embedding quá tải hoặc bảng chưa có vector
const keywordFallbackSearch = async (query: string, limit: number): Promise<KnowledgeHit[]> => {
  const cleanPhrase = extractCleanSearchPhrase(query);
  const words = cleanPhrase
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .slice(0, 5);

  // Chỉ khớp nguyên cụm danh từ chính xác (cleanPhrase) trên tiêu đề hoặc nội dung,
  // và ưu tiên những bản ghi có tiêu đề khớp trực tiếp với cụm từ lên đầu.
  const rows = await prisma.knowledgeChunk.findMany({
    where: {
      isActive: true,
      OR: [
        { title: { contains: cleanPhrase, mode: "insensitive" } },
        { content: { contains: cleanPhrase, mode: "insensitive" } },
      ],
    },
    take: limit * 2,
  });

  if (rows.length > 0) {
    const phraseLower = cleanPhrase.toLowerCase();
    const titleMatched = rows.filter((r) => (r.title ?? "").toLowerCase().includes(phraseLower));
    const prioritized = titleMatched.length > 0 ? titleMatched : rows;
    return prioritized.slice(0, limit).map((r, idx) => ({
      id: r.id,
      title: r.title,
      content: r.content,
      sourceType: r.sourceType,
      placeId: r.placeId,
      eventId: r.eventId,
      distance: 0.2 + idx * 0.05,
    }));
  }

  // Nếu bảng knowledge_chunks chưa kịp index, đọc trực tiếp từ policies.json để trả lời khẩn cấp (mất hộ chiếu, visa...)
  try {
    const policies = await readPolicies();
    const matched = policies
      .filter((p) => {
        const hay = `${p.title} ${p.content}`.toLowerCase();
        return (
          hay.includes(cleanPhrase.toLowerCase()) ||
          (words.length > 0 && words.every((w) => hay.includes(w.toLowerCase())))
        );
      })
      .slice(0, limit);
    if (matched.length > 0) {
      return matched.map((p, idx) => ({
        id: p.id,
        title: p.title,
        content: p.content,
        sourceType: "policy",
        placeId: null,
        eventId: null,
        distance: 0.2 + idx * 0.05,
      }));
    }
  } catch {
    // ignore
  }

  return [];
};

export const searchKnowledge = async (query: string, limit = 5): Promise<KnowledgeHit[]> => {
  try {
    const vector = toVectorLiteral(await embed(query, "RETRIEVAL_QUERY"));
    const hits = await prisma.$queryRaw<KnowledgeHit[]>`
      SELECT "id", "title", "content", "source_type" AS "sourceType",
             "place_id" AS "placeId", "event_id" AS "eventId",
             ("embedding" <=> ${vector}::vector) AS "distance"
      FROM "knowledge_chunks"
      WHERE "is_active" = true AND "embedding" IS NOT NULL
      ORDER BY "embedding" <=> ${vector}::vector
      LIMIT ${limit}
    `;
    if (hits.length > 0) return hits;
  } catch (err) {
    console.warn("[knowledge] Vector search gặp lỗi, chuyển sang Keyword Fallback:", err);
  }

  return keywordFallbackSearch(query, limit);
};
