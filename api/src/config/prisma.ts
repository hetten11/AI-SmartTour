import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { env } from "./env.ts";

const connectionString = env.databaseUrl;
if (!connectionString) throw new Error("Thiếu biến môi trường DATABASE_URL");

export const prisma = new PrismaClient({ adapter: new PrismaPg(connectionString) });
