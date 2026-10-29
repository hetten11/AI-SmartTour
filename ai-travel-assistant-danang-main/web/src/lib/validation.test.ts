import assert from "node:assert/strict";
import test from "node:test";
import {
  validateEmail,
  validateFullName,
  validatePassword,
  validatePasswordConfirm,
} from "./validation.ts";

test("email hợp lệ và không hợp lệ", () => {
  assert.equal(validateEmail("a@b.co"), undefined);
  assert.equal(validateEmail("  a@b.co  "), undefined);
  assert.equal(validateEmail("a@b"), "Email không hợp lệ");
  assert.equal(validateEmail("a b@c.co"), "Email không hợp lệ");
  assert.equal(validateEmail(`${"a".repeat(250)}@b.co`), "Email không hợp lệ");
});

test("mật khẩu từ 8 đến 128 ký tự", () => {
  assert.equal(validatePassword("12345678"), undefined);
  assert.equal(validatePassword("1234567"), "Mật khẩu phải từ 8 đến 128 ký tự");
  assert.equal(
    validatePassword("a".repeat(129)),
    "Mật khẩu phải từ 8 đến 128 ký tự",
  );
});

test("họ tên tối đa 150 ký tự", () => {
  assert.equal(validateFullName(""), undefined);
  assert.equal(validateFullName("a".repeat(151)), "Họ tên tối đa 150 ký tự");
});

test("mật khẩu nhập lại phải khớp", () => {
  assert.equal(validatePasswordConfirm("12345678", "12345678"), undefined);
  assert.equal(
    validatePasswordConfirm("12345678", "12345679"),
    "Mật khẩu nhập lại không khớp",
  );
});
