import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, hashSessionToken, newSessionToken, verifyPassword } from "./crypto.ts";

// Chạy: node --test src/common/crypto.test.ts
test("verify đúng với mật khẩu gốc", async () => {
  const stored = await hashPassword("matkhau123");
  assert.equal(await verifyPassword(stored, "matkhau123"), true);
});

test("sai mật khẩu trả false", async () => {
  const stored = await hashPassword("matkhau123");
  assert.equal(await verifyPassword(stored, "matkhau124"), false);
});

test("hash hỏng trả false, không ném lỗi", async () => {
  assert.equal(await verifyPassword("khong-phai-hash", "matkhau123"), false);
});

test("hai lần hash cùng mật khẩu cho chuỗi khác nhau", async () => {
  assert.notEqual(await hashPassword("matkhau123"), await hashPassword("matkhau123"));
});

test("token phiên 32 byte, hash ổn định và phân biệt", () => {
  const token = newSessionToken();
  assert.equal(Buffer.from(token, "base64url").length, 32);
  assert.equal(hashSessionToken(token), hashSessionToken(token));
  assert.notEqual(hashSessionToken(token), hashSessionToken(newSessionToken()));
});
