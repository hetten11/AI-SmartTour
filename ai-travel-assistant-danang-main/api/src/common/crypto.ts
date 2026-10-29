import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

export const hashPassword = (password: string): Promise<string> =>
  bcrypt.hash(password, 10);

export const verifyPassword = async (storedHash: string, password: string): Promise<boolean> => {
  try {
    return await bcrypt.compare(password, storedHash);
  } catch {
    return false; // chuỗi hash lưu sai định dạng
  }
};

export const newSessionToken = (): string => randomBytes(32).toString("base64url");

export const hashSessionToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");
