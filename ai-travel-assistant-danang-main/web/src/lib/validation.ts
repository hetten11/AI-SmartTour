const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validateEmail = (value: string): string | undefined => {
  const email = value.trim();
  if (!emailPattern.test(email) || email.length > 255) {
    return "Email không hợp lệ";
  }
  return undefined;
};

export const validatePassword = (value: string): string | undefined => {
  if (value.length < 8 || value.length > 128) {
    return "Mật khẩu phải từ 8 đến 128 ký tự";
  }
  return undefined;
};

export const validateFullName = (value: string): string | undefined => {
  if (value.trim().length > 150) return "Họ tên tối đa 150 ký tự";
  return undefined;
};

export const validatePasswordConfirm = (
  password: string,
  confirm: string,
): string | undefined =>
  password === confirm ? undefined : "Mật khẩu nhập lại không khớp";
