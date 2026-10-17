# Clean Greystones — Dog Fouling Map, Bin Audit & Council Action

Civic evidence web application for residents of **Greystones, Co. Wicklow, Ireland** to map dog fouling hotspots, overlay public municipal bins to test the council's "adequate bins / long walk" claims, and send data-backed, legally cited emails to the 6 Greystones Municipal District councillors in under 30 seconds.

## Key Features
1. **Interactive Google Map of Greystones (`src/components/GreystonesMapView.tsx`)**:
   - Centered on Greystones (South Beach Promenade, Church Road, DART Station, Harbour Marina, Burnaby Park, The Cove, Kindlestown, Charlesland).
   - Switchable Google Streets, Google Hybrid Satellite, and Clean Coastal basemap layers.
   - **Emoji Severity Pins**:
     - `💩` **Just Poop (Uncollected)**
     - `👟` **Stepped In by Pedestrian**
     - `👶` **Buggy / Stroller Wheels**
     - `♿` **Wheelchair Contamination**
   - **Simple 1-Tap Mode**: Clicking anywhere on the map immediately logs a poop pin, snaps to the nearest Greystones path/street, and computes exact distance in metres to the nearest public bin.
2. **Public Bin Overlay & "Council Myth-Buster" Proximity Engine (`src/utils/graphEngine.ts`)**:
   - Pre-loaded with the real OpenStreetMap Overpass query snapshot (`osm_bins_2026-10-16.geojson` — 16 `amenity=waste_basket` bins and 2 bring banks, plus crowd verification voting and missing-bin submission).
   - Renders red dashed tether lines between fouling pins and nearby bins (`4m to Bin #G-14`, `7m to Bin #G-08`), proving that 75%+ of seafront and town-centre fouling happens within metres of a serviced bin, while also honestly reporting outer walks (`>200m` from any bin) such as Kindlestown Woods, Charlesland Spine Path, and the Cliff Walk start.
3. **30-Second Councillor Email Builder (`src/App.tsx`)**:
   - Pre-addressed to all 6 elected Greystones MD Councillors (`sstokes@wicklowcoco.ie`, `lscott@wicklowcoco.ie`, `ofinn@wicklowcoco.ie`, `tfortune@wicklowcoco.ie`, `lfenelongaskin@wicklowcoco.ie`, `mbarry@wicklowcoco.ie`) + CC to `envcomplaints@wicklowcoco.ie`, `GreystonesMD@wicklowcoco.ie`, and `env@wicklowcoco.ie`.
   - 4 evidence templates with automatic insertion of live map stats and verified legal citations (`s.22 Litter Pollution Act 1997`, `€250` on-the-spot fine commenced 1 Sept 2026 under `s.36 Circular Economy Act 2022`, and `Wicklow Litter Management Plan 2026–2029`).
   - Opens directly in the resident's mail client (`mailto:`), Gmail Web, or copies to clipboard. Never sends email automatically.

## Verification & Build
```bash
npm run typecheck
npm test
npm run build
```
