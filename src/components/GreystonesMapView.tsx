import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { FoulingReport, PublicBin, SeverityType } from '../types';
import { SEVERITY_META, haversineDistanceMeters } from '../utils/graphEngine';

interface GreystonesMapViewProps {
  reports: FoulingReport[];
  bins: PublicBin[];
  activeFilter: 'all' | 'near_bins' | 'wheels' | 'stepped_in';
  showBinOverlay: boolean;
  showProximityLines: boolean;
  selectedReport: FoulingReport | null;
  onSelectReport: (report: FoulingReport | null) => void;
  selectedBin: PublicBin | null;
  onSelectBin: (bin: PublicBin | null) => void;
  draftCoords: { lat: number; lng: number };
  onMapClickDropPin: (lat: number, lng: number) => void;
  quickOneTapMode: boolean;
  quickSeverity: SeverityType;
}

export const GreystonesMapView: React.FC<GreystonesMapViewProps> = ({
  reports,
  bins,
  activeFilter,
  showBinOverlay,
  showProximityLines,
  selectedReport,
  onSelectReport,
  onSelectBin,
  draftCoords,
  onMapClickDropPin,
  quickOneTapMode,
  quickSeverity,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  const [basemapStyle, setBasemapStyle] = useState<'google_streets' | 'google_hybrid' | 'clean_coastal'>('google_streets');

  // Filter reports
  const filteredReports = reports.filter((r) => {
    if (r.status === 'merged') return false;
    if (activeFilter === 'near_bins') return r.dBinAllM <= 25;
    if (activeFilter === 'wheels') {
      return r.severity === 'buggy_wheels' || r.severity === 'wheelchair_wheels';
    }
    if (activeFilter === 'stepped_in') return r.severity === 'stepped_in';
    return true;
  });

  // Initialize Map once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [53.1445, -6.0615], // Greystones South Beach Prom & Church Road
      zoom: 16,
      zoomControl: false,
      attributionControl: true,
    });

    const tileUrl =
      'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';
    const tileLayer = L.tileLayer(tileUrl, {
      maxZoom: 20,
      attribution: 'Map data &copy; Google & OpenStreetMap contributors · Greystones MD',
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

  // Switch basemap tile URL when basemapStyle changes
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

  // Render Bins, Proximity Lines, Incident Emoji Pins, and Active Drop Target
  useEffect(() => {
    const layerGroup = layerGroupRef.current;
    if (!layerGroup) return;
    layerGroup.clearLayers();

    // 1. Render Public Bins Overlay
    if (showBinOverlay) {
      for (const bin of bins) {
        if (bin.status === 'removed') continue;
        const isVerified = bin.status === 'verified';
        const isRecycling = bin.kind === 'recycling';

        const binHtml = `
          <div class="relative flex flex-col items-center group cursor-pointer select-none">
            <div class="${
              isRecycling
                ? 'bg-slate-600 text-white border-white'
                : isVerified
                ? 'bg-[#006948] text-white border-white ring-2 ring-[#006948]/40'
                : 'bg-white text-[#006948] border-2 border-dashed border-[#006948]'
            } w-8 h-8 rounded-full border-2 shadow-md flex items-center justify-center text-sm transition-transform hover:scale-110">
              ${isRecycling ? '♻️' : '🗑️'}
            </div>
            <div class="mt-0.5 bg-[#0b1c30]/90 text-[#f8f9ff] font-display text-[9px] font-bold px-1.5 py-0.2 rounded whitespace-nowrap shadow">
              ${bin.code}${!isVerified ? ' (?)' : ''}
            </div>
          </div>
        `;

        const icon = L.divIcon({
          html: binHtml,
          className: 'clean-gs-bin-marker',
          iconSize: [44, 44],
          iconAnchor: [22, 20],
        });

        const marker = L.marker([bin.lat, bin.lng], { icon, zIndexOffset: 100 });
        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          onSelectReport(null);
          onSelectBin(bin);
        });
        marker.addTo(layerGroup);
      }
    }

    // 2. Render Dashed Red Proximity Lines & Report Emoji Pins
    for (const report of filteredReports) {
      const nearestBin = bins.find((b) => b.id === report.nearestBinId);
      const isNearBin = report.dBinAllM <= 35;

      if (showProximityLines && showBinOverlay && nearestBin && isNearBin) {
        const polyline = L.polyline(
          [
            [report.lat, report.lng],
            [nearestBin.lat, nearestBin.lng],
          ],
          {
            color: '#ba1a1a',
            weight: 2.5,
            dashArray: '4, 5',
            opacity: 0.85,
          }
        );
        polyline.addTo(layerGroup);
      }

      const meta = SEVERITY_META[report.severity];
      const isSelected = selectedReport?.id === report.id;
      const isCleared = report.status === 'cleared';
      const isHighImpact = meta.isHighImpact && !isCleared;

      const badgeLabel = isCleared
        ? '✅ Cleared'
        : report.dBinAllM <= 25
        ? `📏 ${report.dBinAllM}m to bin`
        : `${report.dBinAllM}m`;

      const pinHtml = `
        <div class="relative flex flex-col items-center select-none group">
          <div class="relative">
            ${
              isSelected || report.severity === 'wheelchair_wheels'
                ? '<span class="CleanGS-pulse-ring"></span>'
                : ''
            }
            <div class="relative ${
              isCleared
                ? 'bg-emerald-100 border-emerald-600 opacity-85'
                : isSelected
                ? 'bg-white border-[#ba1a1a] scale-110 ring-4 ring-[#ba1a1a]/30'
                : isHighImpact
                ? 'bg-white border-[#ba1a1a]'
                : 'bg-white border-amber-800'
            } w-9 h-9 rounded-full border-2 shadow-lg flex items-center justify-center text-lg transition-transform hover:scale-110">
              <span>${isCleared ? '✅' : meta.emoji}</span>
            </div>
            ${
              isHighImpact
                ? `<div class="absolute -top-1 -right-1 bg-[#ba1a1a] text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-extrabold shadow">!</div>`
                : ''
            }
          </div>
          <span class="mt-0.5 ${
            isCleared
              ? 'bg-emerald-700 text-white'
              : report.dBinAllM <= 25
              ? 'bg-[#ba1a1a] text-white'
              : 'bg-slate-800 text-white'
          } text-[9px] font-bold px-1.5 py-0.2 rounded whitespace-nowrap shadow">
            ${badgeLabel}
          </span>
        </div>
      `;

      const icon = L.divIcon({
        html: pinHtml,
        className: 'clean-gs-report-marker',
        iconSize: [56, 52],
        iconAnchor: [28, 22],
      });

      const marker = L.marker([report.lat, report.lng], {
        icon,
        zIndexOffset: isSelected ? 900 : isHighImpact ? 500 : 300,
      });

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        onSelectBin(null);
        onSelectReport(report);
      });

      marker.addTo(layerGroup);
    }

    // 3. Render Draft / Target Crosshair Pin for User's Next Drop
    let nearestDraftBinDist = 999;
    let nearestDraftBinCode = 'Bin';
    for (const b of bins) {
      const d = haversineDistanceMeters(draftCoords.lat, draftCoords.lng, b.lat, b.lng);
      if (d < nearestDraftBinDist) {
        nearestDraftBinDist = d;
        nearestDraftBinCode = b.code;
      }
    }

    const activeEmoji = SEVERITY_META[quickSeverity].emoji;
    const draftHtml = `
      <div class="relative flex flex-col items-center pointer-events-none select-none">
        <div class="bg-[#213145] text-[#eaf1ff] px-2.5 py-0.5 rounded-full shadow-lg text-[10px] font-bold flex items-center gap-1 mb-1 whitespace-nowrap border border-emerald-400/50">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          <span>Target Pin (${nearestDraftBinDist}m to ${nearestDraftBinCode})</span>
        </div>
        <div class="w-11 h-11 rounded-2xl bg-amber-900 border-2 border-white shadow-xl flex items-center justify-center text-2xl">
          ${activeEmoji}
        </div>
        <div class="w-2.5 h-2.5 bg-amber-900 rotate-45 -mt-1.5"></div>
      </div>
    `;

    const draftIcon = L.divIcon({
      html: draftHtml,
      className: 'clean-gs-draft-marker',
      iconSize: [140, 74],
      iconAnchor: [70, 66],
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
    showProximityLines,
    selectedReport,
    draftCoords,
    quickOneTapMode,
    quickSeverity,
  ]);

  const handleRecenterGreystones = () => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.flyTo([53.1443, -6.0606], 16, { duration: 0.7 });
  };

  const handleFlyToHotspot = (lat: number, lng: number, zoom = 17) => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.flyTo([lat, lng], zoom, { duration: 0.7 });
  };

  return (
    <div className="relative w-full h-full flex-1 overflow-hidden bg-[#eef4fb]">
      {/* Real Interactive Map Container */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Top Left Quick Jump Pills for Greystones Zones */}
      <div className="absolute top-3 left-3 z-20 flex flex-wrap gap-1.5 max-w-[75%] pointer-events-auto">
        <button
          type="button"
          onClick={() => handleFlyToHotspot(53.1442, -6.0604, 17)}
          className="bg-surface-container-lowest/95 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-md text-[11px] font-display font-bold text-on-surface hover:bg-primary hover:text-white transition-colors flex items-center gap-1"
        >
          <span>🏖️</span> South Beach Prom
        </button>
        <button
          type="button"
          onClick={() => handleFlyToHotspot(53.1451, -6.0635, 17)}
          className="bg-surface-container-lowest/95 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-md text-[11px] font-display font-bold text-on-surface hover:bg-primary hover:text-white transition-colors flex items-center gap-1"
        >
          <span>🚆</span> Church Rd & DART
        </button>
        <button
          type="button"
          onClick={() => handleFlyToHotspot(53.1492, -6.063, 16)}
          className="bg-surface-container-lowest/95 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-md text-[11px] font-display font-bold text-on-surface hover:bg-primary hover:text-white transition-colors flex items-center gap-1"
        >
          <span>⚓</span> Harbour Marina
        </button>
        <button
          type="button"
          onClick={() => handleFlyToHotspot(53.1465, -6.0762, 16)}
          className="bg-surface-container-lowest/95 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-md text-[11px] font-display font-bold text-on-surface hover:bg-primary hover:text-white transition-colors flex items-center gap-1"
        >
          <span>🌲</span> Kindlestown (No Bins)
        </button>
      </div>

      {/* Floating Right Map Controls */}
      <div className="absolute right-3 top-3 flex flex-col gap-2 z-20 pointer-events-auto">
        <button
          type="button"
          onClick={handleRecenterGreystones}
          className="w-10 h-10 bg-surface-container-lowest text-on-surface rounded-xl shadow-md border border-slate-200 flex items-center justify-center hover:bg-surface-container active:scale-95 transition-transform"
          title="Recenter on Greystones South Beach & Town"
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
          className="w-10 h-10 bg-surface-container-lowest text-on-surface rounded-xl shadow-md border border-slate-200 flex items-center justify-center hover:bg-surface-container active:scale-95 transition-transform"
          title="Switch Map Layer (Google Streets / Satellite / Clean Coastal)"
        >
          <span className="material-symbols-outlined text-[20px] text-secondary">layers</span>
        </button>
      </div>

      {/* Tap anywhere instruction pill */}
      <div className="absolute top-14 left-3 z-20 pointer-events-none hidden sm:block">
        <div className="bg-surface-container-lowest/90 backdrop-blur-sm px-3 py-1 rounded-full border border-slate-200 shadow-sm text-[11px] font-medium text-on-surface-variant flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[14px] text-primary">touch_app</span>
          <span>
            {quickOneTapMode
              ? 'Simple 1-Tap Mode Active: Click anywhere on the map to immediately log poop + calculate bin distance'
              : 'Click anywhere on the map to position your pin, or tap an existing 💩 / ♿ / 🗑️ marker'}
          </span>
        </div>
      </div>
    </div>
  );
};
