// Field error của TanStack Form là `unknown[]`: validator thường trả string,
// validator kiểu standard schema trả object có `message`.
export const firstError = (errors: unknown[]): string | undefined => {
  for (const error of errors) {
    if (typeof error === "string" && error !== "") return error;
    if (error && typeof error === "object" && "message" in error) {
      return String(error.message);
    }
  }
  return undefined;
};
