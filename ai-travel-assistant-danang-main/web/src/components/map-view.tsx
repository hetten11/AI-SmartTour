import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export type MapPoint = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  note?: string;
};

type MapViewProps = {
  points: MapPoint[];
  onPick?: (latitude: number, longitude: number) => void;
  height?: number;
  className?: string;
};

const DA_NANG: [number, number] = [16.0544, 108.2022];

export function MapView({
  points,
  onPick,
  height = 320,
  className,
}: MapViewProps) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<L.LayerGroup | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;

  useEffect(() => {
    if (!box.current) return;
    const instance = L.map(box.current, { scrollWheelZoom: false }).setView(
      DA_NANG,
      12,
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(instance);
    markers.current = L.layerGroup().addTo(instance);
    instance.on("click", (event: L.LeafletMouseEvent) => {
      pick.current?.(event.latlng.lat, event.latlng.lng);
    });
    map.current = instance;
    return () => {
      instance.remove();
      map.current = null;
      markers.current = null;
    };
  }, []);

  useEffect(() => {
    const group = markers.current;
    if (!group) return;
    group.clearLayers();
    for (const point of points) {
      L.marker([point.latitude, point.longitude])
        .bindPopup(point.note ? `${point.name} · ${point.note}` : point.name)
        .addTo(group);
    }
    if (points.length > 0) {
      map.current?.fitBounds(
        L.latLngBounds(
          points.map((point) => L.latLng(point.latitude, point.longitude)),
        ),
        { padding: [30, 30], maxZoom: 15 },
      );
    }
  }, [points]);

  return (
    <div
      ref={box}
      style={{ height }}
      className={cn(
        "relative z-0 w-full rounded-xl ring-1 ring-foreground/10",
        className,
      )}
    />
  );
}
