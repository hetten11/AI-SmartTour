import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";

// argon2id với tham số mặc định của thư viện: memoryCost 65536 (64 MiB),
// timeCost 3, parallelism 4. Nâng tham số khi cần chống brute-force mạnh hơn,
// hàm verify đọc tham số từ chính chuỗi hash nên hash cũ vẫn kiểm tra được.
export const hashPassword = (password: string): Promise<string> => argon2.hash(password);

export const verifyPassword = async (storedHash: string, password: string): Promise<boolean> => {
  try {
    return await argon2.verify(storedHash, password);
  } catch {
    return false; // chuỗi hash lưu sai định dạng
  }
};

export const newSessionToken = (): string => randomBytes(32).toString("base64url");

export const hashSessionToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");
