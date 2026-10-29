export const dicebearAvatarUrl = (email: string) =>
  `https://api.dicebear.com/9.x/avataaars/svg?seed=${Buffer.from(email.toLowerCase()).toString("hex")}`;
