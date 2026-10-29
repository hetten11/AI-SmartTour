import type { ErrorRequestHandler, RequestHandler } from "express";

export class AppError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const notFound: RequestHandler = (req, res) => {
  res.status(404).json({ error: `Không có route ${req.method} ${req.path}` });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    if (err.status >= 500) console.error(err);
    res.status(err.status).json({ error: err.message });
    return;
  }

  if ((err as { code?: string }).code === "P2002") {
    res.status(409).json({ error: "Dữ liệu đã tồn tại" });
    return;
  }

  if ((err as { type?: string }).type === "entity.parse.failed") {
    res.status(400).json({ error: "Dữ liệu JSON không hợp lệ" });
    return;
  }

  // File JSON tải lên vượt giới hạn body của express.json.
  if ((err as { type?: string }).type === "entity.too.large") {
    res.status(413).json({ error: "Dữ liệu gửi lên quá lớn, giới hạn 5MB" });
    return;
  }

  console.error(err);
  res.status(500).json({ error: "Lỗi hệ thống, vui lòng thử lại sau" });
};
