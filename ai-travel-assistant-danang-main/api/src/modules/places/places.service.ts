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

  // Khớp nguyên cụm từ chính xác (Exact Phrase Match) trên tên, khu vực, địa chỉ, thẻ hoặc mô tả.
  // Tuyệt đối KHÔNG tách "mỹ sơn" thành 2 từ rời "mỹ" VÀ "sơn" (vì sẽ bắt nhầm địa điểm ở quận Sơn Trà có phường Phước Mỹ!).
  const where = {
    isActive: true,
    ...(district ? { district } : {}),
    ...(category ? { category } : {}),
    ...(sponsoredOnly ? { isSponsored: true } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { district: { contains: q, mode: "insensitive" as const } },
            { address: { contains: q, mode: "insensitive" as const } },
            { tags: { has: q.toLowerCase() } },
            { description: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  // Cơ chế ưu tiên (Sponsored / Featured Listing) + Ưu tiên khớp Tên chính xác nhất lên đầu:
  const [rawPlaces, total] = await Promise.all([
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

  // Nếu có từ khoá tìm kiếm `q`, ưu tiên địa điểm có Tên hoặc Quận khớp trực tiếp với `q` lên đầu tiên
  // (trước các địa điểm chỉ nhắc tới `q` trong phần mô tả phụ).
  const qLower = q?.toLowerCase();
  const places = qLower
    ? [...rawPlaces].sort((a, b) => {
        const aNameMatch = a.name.toLowerCase().includes(qLower) ? 1 : 0;
        const bNameMatch = b.name.toLowerCase().includes(qLower) ? 1 : 0;
        if (aNameMatch !== bNameMatch) return bNameMatch - aNameMatch;

        const aDistMatch = (a.district ?? "").toLowerCase().includes(qLower) ? 1 : 0;
        const bDistMatch = (b.district ?? "").toLowerCase().includes(qLower) ? 1 : 0;
        if (aDistMatch !== bDistMatch) return bDistMatch - aDistMatch;

        return 0;
      })
    : rawPlaces;

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
