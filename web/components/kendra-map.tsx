"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { KendraWithDistance } from "@/lib/geo/nearest";

type Props = {
  centre: { lat: number; lng: number };
  kendras: KendraWithDistance[];
  youLabel: string;
};

// Leaflet touches `window`, so it is imported inside useEffect (browser only). Circle markers
// are used instead of image pins, which avoids Leaflet's well-known broken-icon problem.
export function KendraMap({ centre, kendras, youLabel }: Props) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: import("leaflet").Map | undefined;
    let cancelled = false;

    import("leaflet").then((L) => {
      if (cancelled || !container.current) return;
      map = L.map(container.current, { scrollWheelZoom: false });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      const you = L.circleMarker([centre.lat, centre.lng], {
        radius: 9,
        color: "#1d4ed8",
        fillColor: "#3b82f6",
        fillOpacity: 0.9,
      }).bindTooltip(youLabel);
      you.addTo(map);

      const points: [number, number][] = [[centre.lat, centre.lng]];
      kendras.forEach((k, i) => {
        L.circleMarker([k.lat, k.lng], {
          radius: 11,
          color: "#0f6b5c",
          fillColor: "#14b8a6",
          fillOpacity: 0.9,
        })
          .bindTooltip(`${i + 1}. ${k.code}`, { permanent: true, direction: "top" })
          .addTo(map!);
        points.push([k.lat, k.lng]);
      });
      map.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 15 });
    });

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [centre, kendras, youLabel]);

  return (
    <div
      ref={container}
      className="h-72 w-full overflow-hidden rounded-xl border border-border"
      role="region"
      aria-label="Map"
    />
  );
}
