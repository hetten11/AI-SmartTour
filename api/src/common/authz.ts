import type { RequestHandler } from "express";
import { AppError } from "./http-error.ts";

export const requireRole =
  (...roles: string[]): RequestHandler =>
  (_req, res, next) => {
    const role = (res.locals.user as { role?: string } | undefined)?.role;
    if (!role || !roles.includes(role)) {
      throw new AppError(403, "Không có quyền truy cập");
    }
    next();
  };
