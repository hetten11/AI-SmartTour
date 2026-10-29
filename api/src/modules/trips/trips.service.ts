import { z } from "zod";
import { AppError } from "../../common/http-error.ts";
import { parseInput, readUuidParam } from "../../common/validate.ts";
import { prisma } from "../../config/prisma.ts";
import type { Prisma } from "../../generated/prisma/client.ts";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const companionsSchema = z
  .array(
    z.object({
      name: z.string().trim().max(150).nullish(),
      age: z.coerce.number().int().min(0).max(120).nullish(),
      gender: z.enum(["male", "female", "other"]).nullish(),
      notes: z.string().trim().max(500).nullish(),
    }),
  )
  .max(20);

const baseFields = {
  title: z.string().trim().max(150).nullish(),
  startDate: z.string().regex(datePattern, "Ngày bắt đầu phải theo dạng YYYY-MM-DD"),
  endDate: z.string().regex(datePattern, "Ngày kết thúc phải theo dạng YYYY-MM-DD"),
  adults: z.coerce.number().int().min(1).max(20).default(1),
  children: z.coerce.number().int().min(0).max(20).default(0),
  notes: z.string().trim().max(2000).nullish(),
};

const createSchema = z.object({ ...baseFields, companions: companionsSchema.default([]) });
const updateSchema = z
  .object({ ...baseFields, companions: companionsSchema.optional() })
  .partial();

const toDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

type CompanionInput = z.infer<typeof companionsSchema>[number];

const companionFields = (companion: CompanionInput) => ({
  name: companion.name ?? null,
  age: companion.age ?? null,
  gender: companion.gender ?? null,
  notes: companion.notes ?? null,
});

const findTripId = async (userId: string, tripId: unknown) => {
  const id = readUuidParam(tripId, "chuyến đi");
  const trip = await prisma.trip.findFirst({ where: { id, userId }, select: { id: true } });
  if (!trip) throw new AppError(404, "Không tìm thấy chuyến đi");
  return trip.id;
};

export const listTrips = (userId: string) =>
  prisma.trip.findMany({
    where: { userId },
    include: { companions: true, _count: { select: { itineraries: true } } },
    orderBy: { startDate: "desc" },
  });

export const getTrip = async (userId: string, tripId: unknown) => {
  const id = await findTripId(userId, tripId);
  return prisma.trip.findUniqueOrThrow({
    where: { id },
    include: {
      companions: true,
      itineraries: {
        select: { id: true, title: true, status: true, version: true, createdAt: true },
        orderBy: { version: "desc" },
      },
    },
  });
};

export const createTrip = async (userId: string, body: unknown) => {
  const input = parseInput(createSchema, body);
  const startDate = toDate(input.startDate);
  const endDate = toDate(input.endDate);
  if (endDate < startDate) throw new AppError(400, "Ngày kết thúc phải sau ngày bắt đầu");

  return prisma.trip.create({
    data: {
      userId,
      profileId: null,
      title: input.title ?? null,
      startDate,
      endDate,
      adults: input.adults,
      children: input.children,
      notes: input.notes ?? null,
      companions: { create: input.companions.map(companionFields) },
    },
    include: { companions: true },
  });
};

export const updateTrip = async (userId: string, tripId: unknown, body: unknown) => {
  const id = await findTripId(userId, tripId);
  const input = parseInput(updateSchema, body);

  const data: Prisma.TripUpdateInput = {};
  if (input.title !== undefined) data.title = input.title ?? null;
  if (input.notes !== undefined) data.notes = input.notes ?? null;
  if (input.adults !== undefined) data.adults = input.adults;
  if (input.children !== undefined) data.children = input.children;
  if (input.startDate !== undefined) data.startDate = toDate(input.startDate);
  if (input.endDate !== undefined) data.endDate = toDate(input.endDate);

  if (input.companions !== undefined) {
    await prisma.tripCompanion.deleteMany({ where: { tripId: id } });
    await prisma.tripCompanion.createMany({
      data: input.companions.map((companion) => ({ ...companionFields(companion), tripId: id })),
    });
  }

  return prisma.trip.update({
    where: { id },
    data,
    include: { companions: true },
  });
};

export const deleteTrip = async (userId: string, tripId: unknown) => {
  const id = await findTripId(userId, tripId);
  await prisma.trip.delete({ where: { id } });
};
