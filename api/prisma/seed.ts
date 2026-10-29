import { readFile } from "node:fs/promises";
import path from "node:path";
import { dicebearAvatarUrl } from "../src/common/avatar.ts";
import { hashPassword } from "../src/common/crypto.ts";
import { prisma } from "../src/config/prisma.ts";

type PlaceSeed = {
  slug: string;
  name: string;
  category: string;
  district?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  priceLevel?: number;
  avgRating?: number;
  tags?: string[];
  description?: string;
};

const readJson = async <T>(file: string): Promise<T> => {
  const filePath = path.resolve(process.cwd(), "prisma/data", file);
  return JSON.parse(await readFile(filePath, "utf8")) as T;
};

const seedPlaces = async () => {
  const places = await readJson<PlaceSeed[]>("places.json");
  for (const place of places) {
    const data = {
      name: place.name,
      category: place.category,
      district: place.district ?? null,
      address: place.address ?? null,
      latitude: place.latitude ?? null,
      longitude: place.longitude ?? null,
      priceLevel: place.priceLevel ?? null,
      avgRating: place.avgRating ?? null,
      tags: place.tags ?? [],
      description: place.description ?? null,
      isActive: true,
    };
    await prisma.place.upsert({
      where: { slug: place.slug },
      create: { ...data, slug: place.slug },
      update: data,
    });
  }
  return places.length;
};

// Nguồn demo đọc file trong prisma/data, không cần Internet hay API key.
const seedSources = async () => {
  const sources = [
    {
      name: "Sự kiện Đà Nẵng (file demo)",
      url: "prisma/data/events-danang.json",
      sourceType: "file",
      cronExpression: "0 6 * * *",
      isActive: true,
    },
  ];

  for (const source of sources) {
    const existing = await prisma.dataSource.findFirst({ where: { url: source.url } });
    if (!existing) await prisma.dataSource.create({ data: source });
  }
  return sources.length;
};

const seedAdmin = async () => {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return false;

  await prisma.user.upsert({
    where: { email: email.trim().toLowerCase() },
    create: {
      email: email.trim().toLowerCase(),
      passwordHash: await hashPassword(password),
      fullName: "Quản trị viên",
      avatarUrl: dicebearAvatarUrl(email.trim().toLowerCase()),
      role: "admin",
    },
    update: { role: "admin", isActive: true },
  });
  return true;
};

const places = await seedPlaces();
const sources = await seedSources();
const admin = await seedAdmin();

console.log(
  `Seed xong: ${places} địa điểm, ${sources} nguồn dữ liệu, tài khoản admin: ${admin ? "có" : "bỏ qua"}`,
);
console.log("Chạy đồng bộ sự kiện: POST /api/admin/sources/:id/run, sau đó POST /api/admin/knowledge/reindex");

await prisma.$disconnect();
