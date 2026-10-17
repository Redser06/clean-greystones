import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { FoulingReport, PublicBin, SeverityType } from '../types';
import { SEVERITY_META } from '../utils/graphEngine';

interface GreystonesMapViewProps {
  reports: FoulingReport[];
  bins: PublicBin[];
  activeFilter: 'all' | 'near_bins' | 'wheels' | 'stepped_in';
  showBinOverlay: boolean;
  selectedReport: FoulingReport | null;
  onSelectReport: (report: FoulingReport | null) => void;
  draftCoords: { lat: number; lng: number };
  onMapClickDropPin: (lat: number, lng: number) => void;
  quickSeverity: SeverityType;
}

export const GreystonesMapView: React.FC<GreystonesMapViewProps> = ({
  reports,
  bins,
  activeFilter,
  showBinOverlay,
  selectedReport,
  onSelectReport,
  draftCoords,
  onMapClickDropPin,
  quickSeverity,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  const [basemapStyle, setBasemapStyle] = useState<'google_streets' | 'google_hybrid' | 'clean_coastal'>('google_streets');

  const filteredReports = reports.filter((r) => {
    if (r.status === 'merged') return false;
    if (activeFilter === 'near_bins') return r.dBinAllM <= 25;
    if (activeFilter === 'wheels') {
      return r.severity === 'buggy_wheels' || r.severity === 'wheelchair_wheels';
    }
    if (activeFilter === 'stepped_in') return r.severity === 'stepped_in';
    return true;
  });

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [53.1445, -6.0615],
      zoom: 16,
      zoomControl: false,
      attributionControl: true,
    });

    const tileLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      attribution: 'Map data &copy; Google & OpenStreetMap · Greystones',
    }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      onMapClickDropPin(
        Number(e.latlng.lat.toFixed(6)),
        Number(e.latlng.lng.toFixed(6))
      );
    });

    mapInstanceRef.current = map;
    tileLayerRef.current = tileLayer;
    layerGroupRef.current = layerGroup;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!tileLayerRef.current) return;
    if (basemapStyle === 'google_streets') {
      tileLayerRef.current.setUrl('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}');
    } else if (basemapStyle === 'google_hybrid') {
      tileLayerRef.current.setUrl('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}');
    } else {
      tileLayerRef.current.setUrl(
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
      );
    }
  }, [basemapStyle]);

  useEffect(() => {
    const layerGroup = layerGroupRef.current;
    if (!layerGroup) return;
    layerGroup.clearLayers();

    // 1. Optional Background Bin Layer (hidden by default so map stays uncluttered, toggleable via drawer)
    if (showBinOverlay) {
      for (const bin of bins) {
        if (bin.status === 'removed' || bin.kind === 'recycling') continue;
        const binHtml = `
          <div class="flex flex-col items-center select-none opacity-85">
            <div class="bg-[#006948] text-white border border-white w-6 h-6 rounded-full shadow-sm flex items-center justify-center text-xs">
              🗑️
            </div>
          </div>
        `;
        const icon = L.divIcon({
          html: binHtml,
          className: 'clean-gs-bin-marker',
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
        L.marker([bin.lat, bin.lng], { icon, zIndexOffset: 50 }).addTo(layerGroup);
      }
    }

    // 2. Render Fouling Emoji Pins (Clean & Uncluttered)
    for (const report of filteredReports) {
      const meta = SEVERITY_META[report.severity];
      const isSelected = selectedReport?.id === report.id;
      const isHighImpact = meta.isHighImpact;

      // Subtle dashed tether to nearest bin ONLY for the actively tapped pin if bins are shown
      if (isSelected && showBinOverlay) {
        const nearestBin = bins.find((b) => b.id === report.nearestBinId);
        if (nearestBin && report.dBinAllM <= 50) {
          L.polyline(
            [
              [report.lat, report.lng],
              [nearestBin.lat, nearestBin.lng],
            ],
            {
              color: '#ba1a1a',
              weight: 2,
              dashArray: '4, 4',
              opacity: 0.75,
            }
          ).addTo(layerGroup);
        }
      }

      const pinHtml = `
        <div class="relative flex flex-col items-center select-none group">
          <div class="relative">
            ${isSelected ? '<span class="CleanGS-pulse-ring"></span>' : ''}
            <div class="relative ${
              isSelected
                ? 'bg-white border-[#006948] scale-110 ring-4 ring-[#006948]/25'
                : isHighImpact
                ? 'bg-white border-[#ba1a1a]'
                : 'bg-white border-[#0b1c30]/30'
            } w-9 h-9 rounded-full border-2 shadow-md flex items-center justify-center text-lg transition-transform hover:scale-110">
              <span>${meta.emoji}</span>
            </div>
          </div>
        </div>
      `;

      const icon = L.divIcon({
        html: pinHtml,
        className: 'clean-gs-report-marker',
        iconSize: [38, 38],
        iconAnchor: [19, 19],
      });

      const marker = L.marker([report.lat, report.lng], {
        icon,
        zIndexOffset: isSelected ? 900 : isHighImpact ? 400 : 200,
      });

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        onSelectReport(report);
      });

      marker.addTo(layerGroup);
    }

    // 3. Subtle draggable crosshair pin for current drop position
    const activeEmoji = SEVERITY_META[quickSeverity].emoji;
    const draftHtml = `
      <div class="relative flex flex-col items-center pointer-events-none select-none">
        <div class="w-10 h-10 rounded-2xl bg-[#006948] border-2 border-white shadow-lg flex items-center justify-center text-xl">
          ${activeEmoji}
        </div>
        <div class="w-2.5 h-2.5 bg-[#006948] rotate-45 -mt-1.5"></div>
      </div>
    `;

    const draftIcon = L.divIcon({
      html: draftHtml,
      className: 'clean-gs-draft-marker',
      iconSize: [44, 48],
      iconAnchor: [22, 44],
    });

    const draftMarker = L.marker([draftCoords.lat, draftCoords.lng], {
      icon: draftIcon,
      draggable: true,
      zIndexOffset: 1000,
    });

    draftMarker.on('dragend', () => {
      const pos = draftMarker.getLatLng();
      onMapClickDropPin(Number(pos.lat.toFixed(6)), Number(pos.lng.toFixed(6)));
    });

    draftMarker.addTo(layerGroup);
  }, [
    filteredReports,
    bins,
    showBinOverlay,
    selectedReport,
    draftCoords,
    quickSeverity,
  ]);

  const handleRecenterGreystones = () => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.flyTo([53.1443, -6.0606], 16, { duration: 0.65 });
  };

  const handleFlyToHotspot = (lat: number, lng: number, zoom = 17) => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.flyTo([lat, lng], zoom, { duration: 0.65 });
  };

  return (
    <div className="relative w-full h-full flex-1 overflow-hidden bg-[#e4ece7]">
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Pre-Configured Zoomed-In Greystones Zones (Compact horizontal strip at top) */}
      <div className="absolute top-2.5 left-2.5 right-14 z-20 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 pointer-events-auto">
        <button
          type="button"
          onClick={() => handleFlyToHotspot(53.1442, -6.0604, 17)}
          className="bg-white/95 backdrop-blur-sm px-2.5 py-1.5 rounded-full border border-line shadow-sm text-xs font-semibold text-ink hover:border-primary hover:text-primary transition-colors flex items-center gap-1 shrink-0"
        >
          <span>🏖️</span> South Beach Prom
        </button>
        <button
          type="button"
          onClick={() => handleFlyToHotspot(53.1451, -6.0635, 17)}
          className="bg-white/95 backdrop-blur-sm px-2.5 py-1.5 rounded-full border border-line shadow-sm text-xs font-semibold text-ink hover:border-primary hover:text-primary transition-colors flex items-center gap-1 shrink-0"
        >
          <span>🚆</span> Church Rd & DART
        </button>
        <button
          type="button"
          onClick={() => handleFlyToHotspot(53.1492, -6.063, 16)}
          className="bg-white/95 backdrop-blur-sm px-2.5 py-1.5 rounded-full border border-line shadow-sm text-xs font-semibold text-ink hover:border-primary hover:text-primary transition-colors flex items-center gap-1 shrink-0"
        >
          <span>⚓</span> Harbour Marina
        </button>
        <button
          type="button"
          onClick={() => handleFlyToHotspot(53.1448, -6.0658, 17)}
          className="bg-white/95 backdrop-blur-sm px-2.5 py-1.5 rounded-full border border-line shadow-sm text-xs font-semibold text-ink hover:border-primary hover:text-primary transition-colors flex items-center gap-1 shrink-0"
        >
          <span>🌳</span> Burnaby Park
        </button>
        <button
          type="button"
          onClick={() => handleFlyToHotspot(53.1465, -6.0762, 16)}
          className="bg-white/95 backdrop-blur-sm px-2.5 py-1.5 rounded-full border border-line shadow-sm text-xs font-semibold text-ink hover:border-primary hover:text-primary transition-colors flex items-center gap-1 shrink-0"
        >
          <span>🌲</span> Kindlestown
        </button>
      </div>

      {/* Floating Right Map Controls */}
      <div className="absolute right-2.5 top-2.5 flex flex-col gap-2 z-20 pointer-events-auto">
        <button
          type="button"
          onClick={handleRecenterGreystones}
          className="w-10 h-10 bg-white/95 text-ink rounded-xl shadow-sm border border-line flex items-center justify-center hover:bg-canvas active:scale-95 transition-transform"
          title="Recenter on Greystones"
        >
          <span className="material-symbols-outlined text-[20px] text-primary">my_location</span>
        </button>
        <button
          type="button"
          onClick={() =>
            setBasemapStyle((prev) =>
              prev === 'google_streets'
                ? 'google_hybrid'
                : prev === 'google_hybrid'
                ? 'clean_coastal'
                : 'google_streets'
            )
          }
          className="w-10 h-10 bg-white/95 text-ink rounded-xl shadow-sm border border-line flex items-center justify-center hover:bg-canvas active:scale-95 transition-transform"
          title="Switch Map Layer (Streets / Satellite / Clean)"
        >
          <span className="material-symbols-outlined text-[20px] text-muted">layers</span>
        </button>
      </div>
    </div>
  );
};
