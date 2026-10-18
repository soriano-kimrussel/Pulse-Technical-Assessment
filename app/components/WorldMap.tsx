"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Map as MapboxMap, Marker } from "mapbox-gl";
import type { PeerDot } from "@/lib/types";
import { getVibe, type VibeId } from "@/lib/vibes";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

const SECONDS_PER_REVOLUTION = 150;

export interface WorldMapHandle {
  recenter: () => void;
}

interface Props {
  peers: PeerDot[];
  me: { lat: number; lng: number } | null;
  onPeerClick: (id: string) => void;
  canConnect: boolean;
  filter: VibeId | null;
  idle: boolean;
}

function rippleDelay(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return `${(Math.abs(hash) % 2400) / 1000}s`;
}

const WorldMap = forwardRef<WorldMapHandle, Props>(function WorldMap(
  { peers, me, onPeerClick, canConnect, filter, idle },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const meMarkerRef = useRef<Marker | null>(null);
  const spinRef = useRef<() => void>(() => {});
  const [ready, setReady] = useState(false);

  const onPeerClickRef = useRef(onPeerClick);
  const canConnectRef = useRef(canConnect);
  const idleRef = useRef(idle);
  const meRef = useRef(me);
  useEffect(() => {
    onPeerClickRef.current = onPeerClick;
    canConnectRef.current = canConnect;
    idleRef.current = idle;
    meRef.current = me;
  });

  useImperativeHandle(ref, () => ({
    recenter() {
      const m = meRef.current;
      if (!m || !mapRef.current) return;
      mapRef.current.flyTo({ center: [m.lng, m.lat], zoom: 4, duration: 1600, essential: true });
    },
  }));

  useEffect(() => {
    if (!TOKEN || !containerRef.current) return;
    let cancelled = false;
    let interacting = false;
    const markers = markersRef.current;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !containerRef.current) return;
      mapboxgl.accessToken = TOKEN;
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/dark-v11",
        projection: "globe",
        center: [-20, 25],
        zoom: 1.6,
        attributionControl: false,
      });
      map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");

      map.on("style.load", () => {
        map.setFog({
          color: "rgb(12, 18, 32)",
          "high-color": "rgb(20, 60, 120)",
          "horizon-blend": 0.04,
          "space-color": "rgb(3, 5, 10)",
          "star-intensity": 0.55,
        });
      });

      const spin = () => {
        if (!idleRef.current || interacting || cancelled) return;
        const center = map.getCenter();
        center.lng -= 360 / SECONDS_PER_REVOLUTION;
        map.easeTo({ center, duration: 1000, easing: (n) => n });
      };
      map.on("mousedown", () => (interacting = true));
      map.on("touchstart", () => (interacting = true));
      map.on("mouseup", () => (interacting = false));
      map.on("touchend", () => (interacting = false));
      map.on("dragend", () => (interacting = false));
      map.on("moveend", spin);
      spinRef.current = spin;

      map.on("load", () => {
        if (cancelled) return;
        setReady(true);
        spin();
      });
      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      markers.forEach((m) => m.remove());
      markers.clear();
      meMarkerRef.current?.remove();
      meMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    if (ready && idle) spinRef.current();
  }, [idle, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || idle || !me) return;
    map.stop();
    map.flyTo({
      center: [me.lng, me.lat],
      zoom: 3.6,
      duration: 2800,
      curve: 1.6,
      essential: true,
    });
  }, [idle, ready, me]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (!me) {
      meMarkerRef.current?.remove();
      meMarkerRef.current = null;
      return;
    }
    let cancelled = false;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;
      if (!meMarkerRef.current) {
        const el = document.createElement("div");
        el.className = "pulse-me";
        el.title = "You - this is where others see your dot";
        el.innerHTML =
          '<span class="pulse-me__halo"></span><span class="pulse-me__core"></span><span class="pulse-me__label">You</span>';
        meMarkerRef.current = new mapboxgl.Marker({ element: el })
          .setLngLat([me.lng, me.lat])
          .addTo(map);
      } else {
        meMarkerRef.current.setLngLat([me.lng, me.lat]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [me, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let cancelled = false;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;
      const markers = markersRef.current;
      const seen = new Set<string>();

      for (const peer of peers) {
        seen.add(peer.id);
        const vibe = getVibe(peer.vibe);
        let marker = markers.get(peer.id);
        if (!marker) {
          const el = document.createElement("button");
          el.type = "button";
          el.className = "pulse-dot";
          el.style.setProperty("--delay", rippleDelay(peer.id));
          el.innerHTML =
            '<span class="pulse-dot__ring"></span><span class="pulse-dot__core"></span><span class="pulse-dot__tip"></span>';
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            if (canConnectRef.current && !el.classList.contains("is-busy")) {
              onPeerClickRef.current(peer.id);
            }
          });
          marker = new mapboxgl.Marker({ element: el })
            .setLngLat([peer.lng, peer.lat])
            .addTo(map);
          markers.set(peer.id, marker);
        }

        const el = marker.getElement();
        el.style.setProperty("--c", vibe.color);
        el.classList.toggle("is-busy", peer.busy);
        el.classList.toggle("is-dim", filter !== null && filter !== peer.vibe);
        el.classList.toggle("is-locked", !canConnect);
        const label = peer.busy
          ? "In a conversation"
          : `${vibe.emoji} ${vibe.label}${canConnect ? " · tap to connect" : ""}`;
        el.setAttribute("aria-label", label);
        const tip = el.querySelector(".pulse-dot__tip");
        if (tip) tip.textContent = label;
      }

      for (const [id, marker] of markers) {
        if (!seen.has(id)) {
          marker.remove();
          markers.delete(id);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [peers, ready, filter, canConnect]);

  return (
    <div className="absolute inset-0 sky">
      <div ref={containerRef} className="h-full w-full" />
      <div className="vignette pointer-events-none absolute inset-0" />

      {!TOKEN && (
        <div className="absolute inset-x-0 bottom-24 flex justify-center px-6">
          <p className="glass max-w-md rounded-2xl px-4 py-3 text-center text-sm text-muted">
            Set <code className="text-accent">NEXT_PUBLIC_MAPBOX_TOKEN</code> in{" "}
            <code className="text-ink">.env</code> to load the globe.
          </p>
        </div>
      )}
    </div>
  );
});

export default WorldMap;
