import { readIntQuery, readTextQuery } from "../../common/validate.ts";
import { prisma } from "../../config/prisma.ts";

const pageSize = 20;

export const listPlaces = async (query: Record<string, unknown>) => {
  const q = readTextQuery(query.q);
  const district = readTextQuery(query.district);
  const category = readTextQuery(query.category);
  const page = readIntQuery(query.page, 0, 500);

  const where = {
    isActive: true,
    ...(district ? { district } : {}),
    ...(category ? { category } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { description: { contains: q, mode: "insensitive" as const } },
            { address: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [places, total] = await Promise.all([
    prisma.place.findMany({
      where,
      orderBy: [{ avgRating: "desc" }, { name: "asc" }],
      skip: page * pageSize,
      take: pageSize,
    }),
    prisma.place.count({ where }),
  ]);

  return { places, total, page, pageSize };
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
