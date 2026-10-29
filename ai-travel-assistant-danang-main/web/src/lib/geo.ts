export type Coordinates = { latitude: number; longitude: number };

// Khoảng cách đường chim bay (km). Không gọi Directions API: cần key và tính phí,
// trong khi nhu cầu chỉ là ước lượng di chuyển giữa hai điểm.
export const distanceKm = (a: Coordinates, b: Coordinates): number => {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};

// Toạ độ trong DB là Decimal nên JSON trả về dạng chuỗi.
export const toCoordinates = (
  latitude: string | number | null,
  longitude: string | number | null,
): Coordinates | null => {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (latitude === null || longitude === null || latitude === "" || longitude === "") return null;
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { latitude: lat, longitude: lng };
};
