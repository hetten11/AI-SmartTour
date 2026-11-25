import { readIntQuery, readTextQuery } from "../../common/validate.ts";
import { prisma } from "../../config/prisma.ts";

const pageSize = 20;

export const listPlaces = async (query: Record<string, unknown>) => {
  const q = readTextQuery(query.q);
  const district = readTextQuery(query.district);
  const category = readTextQuery(query.category);
  const sponsoredOnly = query.sponsored === "true" || query.sponsored === true;
  const page = readIntQuery(query.page, 0, 500);
  const take = query.take ? Math.min(Math.max(Number(query.take) || pageSize, 1), 100) : pageSize;

  const words = q
    ? q
        .trim()
        .split(/\s+/)
        .filter((w) => w.length >= 2)
        .slice(0, 5)
    : [];

  const where = {
    isActive: true,
    ...(district ? { district } : {}),
    ...(category ? { category } : {}),
    ...(sponsoredOnly ? { isSponsored: true } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { description: { contains: q, mode: "insensitive" as const } },
            { address: { contains: q, mode: "insensitive" as const } },
            { district: { contains: q, mode: "insensitive" as const } },
            { tags: { has: q.toLowerCase() } },
            ...(words.length >= 2
              ? [
                  {
                    AND: words.map((w) => ({
                      OR: [
                        { name: { contains: w, mode: "insensitive" as const } },
                        { description: { contains: w, mode: "insensitive" as const } },
                        { address: { contains: w, mode: "insensitive" as const } },
                        { district: { contains: w, mode: "insensitive" as const } },
                      ],
                    })),
                  },
                ]
              : []),
          ],
        }
      : {}),
  };

  // Cơ chế ưu tiên (Sponsored / Featured Listing):
  // Các địa điểm/quán ăn F&B đã ký hợp đồng tài trợ (isSponsored = true) được ưu tiên
  // đẩy lên đầu danh sách theo mức độ ưu tiên (sponsorPriority), sau đó mới tới điểm đánh giá.
  const [places, total] = await Promise.all([
    prisma.place.findMany({
      where,
      orderBy: [
        { isSponsored: "desc" },
        { sponsorPriority: "desc" },
        { avgRating: "desc" },
        { name: "asc" },
      ],
      skip: page * take,
      take,
    }),
    prisma.place.count({ where }),
  ]);

  return { places, total, page, pageSize: take };
};

export const getPlace = (id: string) => prisma.place.findUnique({ where: { id } });

export const listDistricts = async () =>
  (
    await prisma.place.findMany({
      where: { isActive: true, district: { not: null } },
      select: { district: true },
      distinct: ["district"],
      orderBy: { district: "asc" },
    })
  ).map((row) => row.district);
