import { z } from "zod";
import { parseInput } from "../../common/validate.ts";
import { prisma } from "../../config/prisma.ts";

const profileSchema = z.object({
  nationality: z.string().trim().max(2).nullish(),
  language: z.string().trim().max(10).nullish(),
  originCity: z.string().trim().max(100).nullish(),
  budgetMin: z.coerce.number().min(0).max(1_000_000_000).nullish(),
  budgetMax: z.coerce.number().min(0).max(1_000_000_000).nullish(),
  currency: z.string().trim().max(3).nullish(),
  travelStyle: z.string().trim().max(50).nullish(),
  interests: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
  dislikes: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
});

export const getProfile = (userId: string) =>
  prisma.travelerProfile.findFirst({ where: { userId } });

// Bảng không có unique trên user_id nên không dùng upsert của Prisma được.
export const saveProfile = async (userId: string, body: unknown) => {
  const input = parseInput(profileSchema, body);
  const data = {
    ...input,
    budgetMin: input.budgetMin ?? null,
    budgetMax: input.budgetMax ?? null,
  };
  const existing = await prisma.travelerProfile.findFirst({ where: { userId } });
  if (!existing) return prisma.travelerProfile.create({ data: { ...data, userId } });
  return prisma.travelerProfile.update({ where: { id: existing.id }, data });
};
