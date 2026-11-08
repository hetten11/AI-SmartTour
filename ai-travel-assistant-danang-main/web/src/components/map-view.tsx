import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { distanceKm } from "@/lib/geo";
import { cn } from "@/lib/utils";

export type MapPoint = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  note?: string;
  isSponsored?: boolean;
  orderNumber?: number;
  dayNumber?: number;
};

type MapViewProps = {
  points: MapPoint[];
  onPick?: (latitude: number, longitude: number) => void;
  onUserLocationChange?: (latitude: number, longitude: number) => void;
  showRoute?: boolean;
  numbered?: boolean;
  autoLocate?: boolean;
  height?: number;
  className?: string;
};

type RoadRouteResult = {
  latlngs: [number, number][];
  distanceKm: number;
  durationMin: number;
};

const DA_NANG: [number, number] = [16.0544, 108.2022];

// Bộ nhớ đệm đường đi thực tế (OSRM) để không phải gọi lại khi re-render
const routeCache = new Map<string, RoadRouteResult>();

// Gọi OpenStreetMap OSRM Routing API để lấy tọa độ đường đi thực tế bám theo mặt đường bộ
async function fetchRoadRoute(
  waypoints: Array<{ latitude: number; longitude: number }>,
  signal?: AbortSignal,
): Promise<RoadRouteResult | null> {
  if (waypoints.length < 2) return null;

  // Loại bỏ các điểm liên tiếp trùng toạ độ để OSRM không báo lỗi
  const deduped: Array<{ latitude: number; longitude: number }> = [];
  for (const pt of waypoints) {
    const prev = deduped[deduped.length - 1];
    if (
      !prev ||
      Math.abs(prev.latitude - pt.latitude) > 0.00005 ||
      Math.abs(prev.longitude - pt.longitude) > 0.00005
    ) {
      deduped.push(pt);
    }
  }
  if (deduped.length < 2) return null;

  const coordString = deduped
    .map((p) => `${p.longitude.toFixed(6)},${p.latitude.toFixed(6)}`)
    .join(";");

  const cached = routeCache.get(coordString);
  if (cached) return cached;

  const endpoints = [
    `https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=geojson`,
    `https://routing.openstreetmap.de/routed-car/route/v1/driving/${coordString}?overview=full&geometries=geojson`,
  ];

  for (const url of endpoints) {
    try {
      const response = await fetch(url, { signal });
      if (!response.ok) continue;
      const data = (await response.json()) as {
        code?: string;
        routes?: Array<{
          distance?: number;
          duration?: number;
          geometry?: { coordinates?: [number, number][] };
        }>;
      };

      const route = data.routes?.[0];
      const coords = route?.geometry?.coordinates;
      if (!coords || coords.length < 2) continue;

      // GeoJSON trả về [lon, lat], chuyển sang [lat, lon] cho Leaflet
      const latlngs: [number, number][] = coords.map(([lon, lat]) => [lat, lon]);
      const result: RoadRouteResult = {
        latlngs,
        distanceKm: Number(((route.distance ?? 0) / 1000).toFixed(1)),
        durationMin: Math.max(1, Math.round((route.duration ?? 0) / 60)),
      };
      routeCache.set(coordString, result);
      return result;
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return null;
    }
  }

  return null;
}

export function MapView({
  points,
  onPick,
  onUserLocationChange,
  showRoute = false,
  numbered = false,
  autoLocate = false,
  height = 320,
  className,
}: MapViewProps) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<L.LayerGroup | null>(null);
  const routeLayer = useRef<L.LayerGroup | null>(null);
  const userLayer = useRef<L.LayerGroup | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const pick = useRef(onPick);
  pick.current = onPick;
  const userCb = useRef(onUserLocationChange);
  userCb.current = onUserLocationChange;

  const [userPos, setUserPos] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null>(null);
  const [tracking, setTracking] = useState(false);
  const [routeEnabled, setRouteEnabled] = useState(showRoute);
  const [geoStatus, setGeoStatus] = useState<string | null>(null);
  const [roadSummary, setRoadSummary] = useState<{
    distanceKm: number;
    durationMin: number;
    loading: boolean;
  } | null>(null);

  useEffect(() => {
    setRouteEnabled(showRoute);
  }, [showRoute]);

  const stopWatching = () => {
    if (watchIdRef.current !== null && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setTracking(false);
  };

  const startRealtimeLocation = (centerMap = true) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoStatus("Trình duyệt không hỗ trợ định vị GPS");
      return;
    }

    setGeoStatus("Đang xác định vị trí thời gian thực...");
    setTracking(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy || 30,
        };
        setUserPos(next);
        setGeoStatus(null);
        userCb.current?.(next.latitude, next.longitude);
        if (centerMap && map.current) {
          map.current.flyTo([next.latitude, next.longitude], 14, { duration: 0.8 });
        }
      },
      () => {
        setGeoStatus("Không lấy được GPS (hãy cấp quyền vị trí trên trình duyệt)");
        setTracking(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
    );

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const next = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy || 30,
        };
        setUserPos(next);
        setGeoStatus(null);
        userCb.current?.(next.latitude, next.longitude);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
  };

  useEffect(() => {
    if (!box.current) return;
    const instance = L.map(box.current, { scrollWheelZoom: false }).setView(DA_NANG, 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(instance);

    routeLayer.current = L.layerGroup().addTo(instance);
    markers.current = L.layerGroup().addTo(instance);
    userLayer.current = L.layerGroup().addTo(instance);

    instance.on("click", (event: L.LeafletMouseEvent) => {
      pick.current?.(event.latlng.lat, event.latlng.lng);
    });

    map.current = instance;

    if (autoLocate) {
      startRealtimeLocation(false);
    }

    return () => {
      stopWatching();
      instance.remove();
      map.current = null;
      routeLayer.current = null;
      markers.current = null;
      userLayer.current = null;
    };
  }, []);

  // Vẽ vị trí thời gian thực của khách hàng và tuyến đường bộ từ vị trí khách tới điểm đầu tiên
  useEffect(() => {
    const uGroup = userLayer.current;
    if (!uGroup) return;
    uGroup.clearLayers();

    if (!userPos) return;

    const userIcon = L.divIcon({
      className: "custom-user-gps-marker",
      html: `<div style="position:relative;width:22px;height:22px;display:flex;align-items:center;justify-content:center;">
        <span style="position:absolute;width:22px;height:22px;border-radius:9999px;background:rgba(37,99,235,0.35);"></span>
        <span style="position:relative;width:12px;height:12px;border-radius:9999px;background:#2563eb;border:2.5px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></span>
      </div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });

    L.circle([userPos.latitude, userPos.longitude], {
      radius: Math.min(Math.max(userPos.accuracy, 25), 250),
      color: "#3b82f6",
      fillColor: "#60a5fa",
      fillOpacity: 0.15,
      weight: 1,
    }).addTo(uGroup);

    L.marker([userPos.latitude, userPos.longitude], { icon: userIcon })
      .bindPopup(
        `<strong>📍 Vị trí hiện tại của bạn</strong><br/><span style="font-size:12px;color:#64748b;">(${userPos.latitude.toFixed(5)}, ${userPos.longitude.toFixed(5)})</span>`,
      )
      .addTo(uGroup);

    if (!routeEnabled || points.length === 0) return;

    const controller = new AbortController();
    const first = points[0]!;

    void fetchRoadRoute([userPos, first], controller.signal).then((userRoute) => {
      if (controller.signal.aborted || !userLayer.current) return;
      if (userRoute) {
        L.polyline(userRoute.latlngs, {
          color: "#059669",
          weight: 4,
          dashArray: "8, 6",
          opacity: 0.9,
        })
          .bindPopup(
            `🚗 Đường đi từ vị trí của bạn đến "${first.name}": <strong>${userRoute.distanceKm} km</strong> (≈ ${userRoute.durationMin} phút)`,
          )
          .addTo(userLayer.current);
      }
    });

    return () => controller.abort();
  }, [userPos, points, routeEnabled]);

  // Vẽ các ghim địa điểm
  useEffect(() => {
    const group = markers.current;
    if (!group) return;
    group.clearLayers();

    points.forEach((point, index) => {
      const badgeNum = point.orderNumber ?? (numbered ? index + 1 : null);
      const isSponsored = point.isSponsored === true;

      const distText = userPos
        ? `<div style="margin-top:4px;font-size:12px;color:#059669;">📏 Cách bạn ≈ ${distanceKm(userPos, point).toFixed(1)} km</div>`
        : "";

      const navUrl = userPos
        ? `https://www.google.com/maps/dir/?api=1&origin=${userPos.latitude},${userPos.longitude}&destination=${point.latitude},${point.longitude}&travelmode=driving`
        : `https://www.google.com/maps/dir/?api=1&destination=${point.latitude},${point.longitude}&travelmode=driving`;

      const popupHtml = `
        <div style="min-width:170px;line-height:1.4;">
          <div style="font-weight:600;font-size:13px;">
            ${badgeNum !== null ? `<span style="color:#2563eb;">#${badgeNum}</span> ` : ""}
            ${point.name}
          </div>
          ${isSponsored ? `<div style="margin-top:2px;font-size:11px;color:#d97706;font-weight:600;">⭐ Đối tác F&B Đề xuất</div>` : ""}
          ${point.note ? `<div style="font-size:12px;color:#475569;margin-top:2px;">${point.note}</div>` : ""}
          ${distText}
          <div style="margin-top:6px;">
            <a href="${navUrl}" target="_blank" rel="noopener noreferrer" style="font-size:12px;color:#2563eb;text-decoration:underline;font-weight:500;">
              🧭 Chỉ đường Google Maps tới đây
            </a>
          </div>
        </div>
      `;

      if (badgeNum !== null || isSponsored) {
        const bg = isSponsored ? "#d97706" : "#2563eb";
        const label = badgeNum !== null ? String(badgeNum) : "★";
        const customIcon = L.divIcon({
          className: "custom-numbered-pin",
          html: `<div style="width:26px;height:26px;border-radius:9999px;background:${bg};color:#fff;font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,0.35);">
            ${label}
          </div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        });
        L.marker([point.latitude, point.longitude], { icon: customIcon })
          .bindPopup(popupHtml)
          .addTo(group);
      } else {
        L.marker([point.latitude, point.longitude]).bindPopup(popupHtml).addTo(group);
      }
    });

    if (points.length > 0) {
      const allCoords = points.map((point) => L.latLng(point.latitude, point.longitude));
      if (userPos) {
        allCoords.push(L.latLng(userPos.latitude, userPos.longitude));
      }
      map.current?.fitBounds(L.latLngBounds(allCoords), {
        padding: [32, 32],
        maxZoom: 15,
      });
    }
  }, [points, numbered, userPos]);

  // Vẽ tuyến đường giao thông thực tế (bám theo đường phố OSRM thay vì đường chim bay)
  useEffect(() => {
    const rGroup = routeLayer.current;
    if (!rGroup) return;
    rGroup.clearLayers();

    if (!routeEnabled || points.length < 2) {
      setRoadSummary(null);
      return;
    }

    const controller = new AbortController();
    setRoadSummary((prev) => ({
      distanceKm: prev?.distanceKm ?? 0,
      durationMin: prev?.durationMin ?? 0,
      loading: true,
    }));

    void fetchRoadRoute(points, controller.signal).then((road) => {
      if (controller.signal.aborted || !routeLayer.current) return;
      routeLayer.current.clearLayers();

      if (road && road.latlngs.length >= 2) {
        // Viền trắng bên dưới giúp tuyến đường bộ nổi bật rõ ràng trên nền bản đồ
        L.polyline(road.latlngs, {
          color: "#ffffff",
          weight: 7,
          opacity: 0.9,
          lineCap: "round",
          lineJoin: "round",
        }).addTo(routeLayer.current);

        // Đường lộ trình chính bám sát theo từng con đường/cây cầu thực tế
        L.polyline(road.latlngs, {
          color: "#2563eb",
          weight: 4.5,
          opacity: 0.92,
          lineCap: "round",
          lineJoin: "round",
        })
          .bindPopup(
            `🛣️ Lộ trình đường bộ thực tế: <strong>${road.distanceKm} km</strong> · 🚗 Khoảng <strong>${road.durationMin} phút</strong> di chuyển`,
          )
          .addTo(routeLayer.current);

        setRoadSummary({
          distanceKm: road.distanceKm,
          durationMin: road.durationMin,
          loading: false,
        });
      } else {
        setRoadSummary(null);
      }
    });

    return () => controller.abort();
  }, [points, routeEnabled]);

  return (
    <div className="relative w-full">
      <div
        ref={box}
        style={{ height }}
        className={cn(
          "relative z-0 w-full rounded-xl ring-1 ring-foreground/10",
          className,
        )}
      />

      {/* Thanh công cụ định vị thời gian thực & nối tuyến đường bộ trên bản đồ */}
      <div className="pointer-events-auto absolute right-2.5 top-2.5 z-[400] flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            if (tracking && userPos && map.current) {
              map.current.flyTo([userPos.latitude, userPos.longitude], 15, { duration: 0.7 });
            } else {
              startRealtimeLocation(true);
            }
          }}
          className={cn(
            "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium shadow-sm transition",
            tracking
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-border bg-background/95 text-foreground hover:bg-muted",
          )}
          title="Định vị GPS thời gian thực của bạn trên bản đồ"
        >
          <span>📍</span>
          <span>{tracking ? "Vị trí của tôi (Live)" : "Định vị của tôi"}</span>
        </button>

        {points.length >= 2 ? (
          <button
            type="button"
            onClick={() => setRouteEnabled((prev) => !prev)}
            className={cn(
              "flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium shadow-sm transition",
              routeEnabled
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-border bg-background/95 text-foreground hover:bg-muted",
            )}
            title="Nối các địa điểm theo tuyến đường giao thông thực tế (OSRM)"
          >
            <span>🛣️</span>
            <span>{routeEnabled ? "Đang chỉ đường bộ" : "Chỉ đường bộ"}</span>
          </button>
        ) : null}
      </div>

      {/* Thanh hiển thị thông tin quãng đường bộ thực tế & vị trí GPS */}
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        {roadSummary ? (
          <span className="font-medium text-blue-600 dark:text-blue-400">
            {roadSummary.loading
              ? "🛣️ Đang tính toán lộ trình đường bộ thực tế..."
              : `🛣️ Tổng lộ trình đường bộ thực tế: ${roadSummary.distanceKm} km · 🚗 Thời gian lái xe dự kiến ≈ ${roadSummary.durationMin} phút`}
          </span>
        ) : (
          <span />
        )}

        {geoStatus ? (
          <span className="text-amber-600">{geoStatus}</span>
        ) : userPos ? (
          <span className="text-muted-foreground flex items-center gap-2">
            <span>
              🟢 Vị trí của bạn: ({userPos.latitude.toFixed(4)}, {userPos.longitude.toFixed(4)})
            </span>
            <button
              type="button"
              className="text-blue-600 hover:underline"
              onClick={() => {
                const demo = { latitude: 16.0611, longitude: 108.2275, accuracy: 20 };
                setUserPos(demo);
                setTracking(true);
                userCb.current?.(demo.latitude, demo.longitude);
                map.current?.flyTo([demo.latitude, demo.longitude], 14, { duration: 0.7 });
              }}
            >
              Đặt tâm tại Cầu Rồng Đà Nẵng
            </button>
          </span>
        ) : null}
      </div>
    </div>
  );
}
