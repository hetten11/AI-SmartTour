export const errorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    if (error.message === "Failed to fetch" || error.message.includes("NetworkError")) {
      return "";
    }
    return error.message;
  }
  return "Có lỗi xảy ra, thử lại";
};

const toDdMmYy = (date: Date): string => {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
};

export const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mi} ${toDdMmYy(d)}`;
};

export const formatDate = (value: string | null | undefined): string => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return toDdMmYy(d);
};

export const formatMoney = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || value === "") return "—";
  const amount = Number(value);
  return Number.isFinite(amount) ? `${amount.toLocaleString("vi-VN")} đ` : "—";
};

// Tổng người đi = người lớn + trẻ em + người đồng hành đã khai.
export const partyLabel = (trip: {
  adults: number;
  children: number;
  companions: unknown[];
}): string => {
  const parts = [`${trip.adults} người lớn`];
  if (trip.children > 0) parts.push(`${trip.children} trẻ em`);
  if (trip.companions.length > 0) parts.push(`${trip.companions.length} người đồng hành`);
  return `${trip.adults + trip.children + trip.companions.length} người (${parts.join(", ")})`;
};
