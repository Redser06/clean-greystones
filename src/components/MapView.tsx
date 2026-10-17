import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { LatLng, TownBounds } from '../config/schema';
import { basemapForKey, osmBasemap } from '../lib/basemap';

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  count: number;
  draggable: boolean;
}

interface MapViewProps {
  points: MapPoint[];
  zoom: number;
  centre: LatLng;
  bounds: TownBounds;
  colour: string;
  label: string;
  focus?: { lat: number; lng: number; nonce: string } | null;
  attributionInset?: number;
  onMovePoint?: (id: string, lat: number, lng: number) => void;
}

export function MapView({
  points,
  zoom,
  centre,
  bounds,
  colour,
  label,
  focus,
  attributionInset = 8,
  onMovePoint,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tilesRef = useRef<L.TileLayer | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const onMoveRef = useRef(onMovePoint);
  onMoveRef.current = onMovePoint;

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const map = L.map(element, {
      center: [centre.lat, centre.lng],
      zoom,
      maxBounds: [
        [bounds.south, bounds.west],
        [bounds.north, bounds.east],
      ],
      maxBoundsViscosity: 1,
      zoomControl: false,
      attributionControl: true,
    });
    L.control.zoom({ position: 'topright' }).addTo(map);

    const osm = osmBasemap();
    const tiles = L.tileLayer(osm.url, { maxZoom: 19, attribution: osm.attribution }).addTo(map);
    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    tilesRef.current = tiles;
    layerRef.current = group;

    const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    let cancelled = false;
    if (key?.trim()) {
      void basemapForKey(key).then((basemap) => {
        if (cancelled || !mapRef.current || !tilesRef.current) return;
        tilesRef.current.remove();
        tilesRef.current = L.tileLayer(basemap.url, {
          maxZoom: 19,
          attribution: basemap.attribution,
        }).addTo(mapRef.current);
      });
    }

    const frame = window.requestAnimationFrame(() => map.invalidateSize());
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      map.remove();
      mapRef.current = null;
      tilesRef.current = null;
      layerRef.current = null;
    };
  }, [zoom, centre, bounds]);

  useEffect(() => {
    if (!focus || !mapRef.current) return;
    mapRef.current.panTo([focus.lat, focus.lng]);
  }, [focus]);

  useEffect(() => {
    const group = layerRef.current;
    if (!group) return;
    group.clearLayers();

    for (const point of points) {
      if (point.draggable) {
        const icon = L.divIcon({
          className: 'cg-marker',
          html: '<div class="cg-pin" aria-hidden="true"></div>',
          iconSize: [28, 28],
          iconAnchor: [14, 26],
        });
        const marker = L.marker([point.lat, point.lng], {
          icon,
          draggable: true,
          zIndexOffset: 1000,
          title: 'Drag to adjust this report',
          alt: 'Draggable report pin',
        });
        marker.on('dragend', () => {
          const next = marker.getLatLng();
          onMoveRef.current?.(point.id, next.lat, next.lng);
        });
        marker.addTo(group);
        continue;
      }

      const marker = L.circleMarker([point.lat, point.lng], {
        radius: point.count > 1 ? Math.min(22, 8 + point.count * 2) : 7,
        color: '#ffffff',
        weight: 2,
        fillColor: colour,
        fillOpacity: 0.92,
      });
      const noun = point.count === 1 ? 'report' : 'reports';
      marker.bindTooltip(`${point.count} ${noun}`, { direction: 'top' });
      marker.addTo(group);
    }
  }, [points, colour]);

  return (
    <div
      ref={containerRef}
      className="cg-map h-full w-full"
      role="application"
      aria-label={label}
      style={{ ['--cg-inset' as string]: `${attributionInset}px` }}
    />
  );
}
