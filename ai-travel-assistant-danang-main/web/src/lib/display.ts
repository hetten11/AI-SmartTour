export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Có lỗi xảy ra, thử lại";

const dateTimeFormat = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
});
const dateFormat = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short" });

export const formatDateTime = (value: string | null | undefined): string =>
  value ? dateTimeFormat.format(new Date(value)) : "—";

export const formatDate = (value: string | null | undefined): string =>
  value ? dateFormat.format(new Date(value)) : "—";

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
