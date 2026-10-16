# Greystones Dog Fouling Map: PRD and build plan

- Owner: Conor Redmond (civic side project)
- Date: 2026-10-16
- Status: draft v1
- Inspiration: Doodoowatch (BBC, 2018, https://www.bbc.com/news/uk-england-cambridgeshire-43837758). Residents dropped pins on a shared map: red when a mess was spotted, green once it was cleared, with bins shown too.

## 1. Problem and goal
Dog fouling is a visible, recurring problem in Greystones and Delgany. Residents complain, but the complaints are scattered across WhatsApp, Facebook and phone calls to the council, and that produces no evidence anyone can use. Wicklow County Council's own Litter Management Plan 2026–2029 calls dog fouling "a top priority in many parts of the county." It commits to tackling it "with signage, awareness campaigns, enforcement, investigation of new techniques for enforcement and where appropriate bins for disposal."

**Goal:** turn resident sightings into clean, mapped, time-stamped evidence. Show where the hotspots are, test honestly whether they line up with missing bins, and make it a 30-second job for a resident to email the right councillors with the facts and the law attached.

**Non-goals:** identifying or shaming dog owners, running enforcement, sending email on anyone's behalf, or covering all of Wicklow in the MVP.

## 2. Users and jobs to be done
| User | Job to be done |
|---|---|
| Resident or walker (primary) | "When I step around dog mess, I want to log it in one tap so it counts for something." |
| Engaged resident, Tidy Towns volunteer | "I want to see hotspots and send councillors a factual email with the data and the law, without writing it from scratch." |
| Cleaner or volunteer | "I want to mark a spot cleared so the map stays truthful." |
| Councillor or MD staff (Greystones MD) | "I want a weekly summary of where the problem is, and whether bins or enforcement would help." |
| Conor (admin) | "I want to moderate photos and abuse cheaply, and keep the project GDPR-safe." |

## 3. Features

### MVP
1. **One-tap map reporting (Google Maps JS API)**
   - A big "Report poo here" button. It uses browser geolocation (`watchPosition`, high accuracy) and drops a draggable pin so the user can correct it. An optional photo is the only other step. No account is needed: an anonymous device token plus rate limits.
   - Pin states: **red** = spotted, **green** = cleared, **grey** = stale (auto, older than 14 days with no confirmation).
   - Marker clustering (`@googlemaps/markerclusterer`) at low zoom, plus a heatmap toggle. The Maps JS `HeatmapLayer` is deprecated, so we use a deck.gl `HeatmapLayer` overlay, or a server-side H3 hex grid rendered as polygons. We recommend the H3 grid: it is cheaper and it doubles as the hotspot unit.
   - Bin overlay: icons for verified and unverified bins (see 3.3), with a separate style for dog-waste bins and bag dispensers.
   - "Me too": tapping an existing red pin lets you confirm it instead of creating a duplicate.
2. **Councillor directory.** Seeded from `wicklow_councillors.csv` (32 councillors, official @wicklowcoco.ie emails, source: https://www.wicklow.ie/living/Your-Council/Your-Councillors/Elected-Council-Members). The 6 Greystones MD councillors are Tom Fortune, Stephen Stokes, Lourda Scott, Orla Finn, Louise Fenelon Gaskin and Mark Barry. It also lists the council's envcomplaints@wicklowcoco.ie, the Freephone Litter Line 1800 365 123 and Waste Management on 0404 20127 (all from the Litter Management Plan 2026–2029, p. "Free Phone Number"). A quarterly check against the council page flags any changes.
3. **Bin layer with verification** (see section 5): OSM import plus crowd-sourced bins, with a verified or unverified status.
4. **Bins vs fouling analysis, a core feature** (see section 6): nearest-bin distance for every report, the distribution at 50, 100 and 200 m, a random-point baseline, and the "far from any bin" hotspots.
5. **Email builder** (see section 7): pick recipients, pick a template, auto-insert stats, a map link, photos and citations, then open it as a `mailto:` link or copy it. The app never sends email.
6. **Public stats panel:** reports in the last 7 and 30 days, cleared %, median time to clear, top 5 hotspots, and the bin-distance panel.
7. **Moderation queue** for photos and flagged pins (section 9).

### Later (v2+)
- A weekly digest page or PDF for the MD meeting. The councillor email is drafted for a human to send, never sent automatically.
- Tidy Towns volunteer accounts with "cleared" trust weighting.
- A "suggest a bin here" vote, and bag-dispenser requests.
- A PWA with offline queued reports.
- Expansion to Bray and Wicklow MDs, which needs multi-MD routing of councillors.
- An open data export (CC BY 4.0 GeoJSON of anonymised reports).
- An Irish language toggle.

## 4. Laws and policy to cite (verified 2026-10-16)
Each item is marked VERIFIED (read in the source) or UNVERIFIED.

| # | Citation | What it says | Source | Status |
|---|---|---|---|---|
| L1 | **Litter Pollution Act 1997, s.22(1)** | "Where faeces has been deposited by a dog in any place to which this subsection applies, the person in charge of the dog shall immediately remove the faeces and shall ensure that it is properly disposed of in a suitable sanitary manner." | https://www.irishstatutebook.ie/eli/1997/act/12/section/22/enacted/en/html | VERIFIED |
| L2 | **s.22(2)**, places covered | (a) public road, (b) retail shopping centre land, (c) school ground, sports ground, playing field or recreational/leisure area, (d) a beach, (e) the curtilage of a dwelling without the occupier's consent, (f) other prescribed places | same | VERIFIED |
| L3 | **s.22(3)**, exemptions | Guide dogs; working dogs herding livestock, or used by Gardaí or Customs on duty | same | VERIFIED |
| L4 | **s.22(4)** | Contravening s.22(1) is an offence | same | VERIFIED |
| L5 | **Fixed penalty: €250** (was €150), from **1 September 2026**, via commencement of s.36 of the Circular Economy and Miscellaneous Provisions Act 2022 | On-the-spot fine for littering *and dog fouling* | https://www.gov.ie/en/department-of-climate-energy-and-the-environment/press-releases/minister-dillon-welcomes-commencement-of-increased-litter-fines/ ; https://www.citizensinformation.ie/en/environment/waste-and-recycling/littering-and-dumping/ | VERIFIED (gov.ie press release + Citizens Information). I did not read the amended section text on irishstatutebook. |
| L6 | On summary conviction: Class B fine (gov.ie). Citizens Information says "up to €3,000 if you are convicted in the District Court" for littering generally | Court penalty | gov.ie Anti-Dumping 2026 release: https://www.gov.ie/en/department-of-climate-energy-and-the-environment/press-releases/minister-dillon-announces-increased-fines-for-littering-and-dog-fouling-and-launches-2026-anti-dumping-initiative/ | VERIFIED as stated by those sources. The exact euro cap for s.22 specifically is UNVERIFIED, so cite "Class B fine" |
| L7 | **Wicklow Litter Management Plan 2026–2029**: dog fouling is "a top priority in many parts of the county particularly in urban areas and popular walking routes." The objective is "To tackle the issue of dog fouling with signage, awareness campaigns, enforcement, investigation of new techniques for enforcement and where appropriate bins for disposal." It says parking wardens in Greystones are authorised under the Litter Pollution Acts, and that 93 litter fines raised €14,733 in 2024, mostly under s.3 and s.19 (s.22 fines are listed but not counted separately). It also notes Toxocara risk to children, and the habit of leaving bagged dog waste behind. | Local policy commitment | https://www.wicklow.ie/Portals/0/adam/Documents/i58uHq3Y5ECL_zPx23AxyQ/Link/Litter%20Management%20Plan%202025%20Rev%205-Final_.pdf | VERIFIED (read the PDF text). Note the PDF's internal headings mix "2025–2028" and "2026–2029"; the title page says 2026–2029. |
| L8 | Wicklow.ie "Litter & The Law" summary of the dog fouling duty | Plain-English restatement | https://www.wicklow.ie/Living/Services/Environment/Recycling-Waste-Management/Litter-Management/Litter-the-Law | VERIFIED |
| L9 | **Control of Dogs Act 1986** | Dog licensing and control (dogs under effectual control in public). Wicklow's Dog Control page cites it and asks owners to "Clean up after your dog if it fouls in a public place" and to keep dogs on a lead in public places. | https://www.wicklow.ie/Living/Services/Environment/Veterinary-Services/Dog-Control ; Act: https://www.irishstatutebook.ie/eli/1986/act/32/enacted/en/html | Act existence VERIFIED. No specific section is cited: the fouling offence sits in the Litter Act, not this one. Don't quote a section number until checked. |
| L10 | **Wicklow County Council Beach Bye-Laws 2012** (made under Part 19 of the Local Government Act 2001; they replace the 2001 bye-laws) | Prohibit nuisance on scheduled beaches. Any dog-specific clause or seasonal ban is UNVERIFIED: the PDF is a scan and the dog clauses weren't read. Discover Ireland says no dogs on Greystones South Beach May–September, on a lead otherwise. | https://www.wicklow.ie/Portals/0/adam/Content/9WRUgi5HAUe2EdakXcsTBA/Link/Beach%20Bye%20Laws%20for%20County%20Wicklow.pdf ; https://www.discoverireland.ie/wicklow/greystones-south-beach | Bye-law title VERIFIED. Dog clause UNVERIFIED. |
| L11 | A Wicklow dog-control or dog-fouling bye-law specific to parks or streets | None found in search | — | NOT FOUND. Do not cite. |

The citation picker (graph node N9) may only insert rows whose status is VERIFIED. UNVERIFIED rows sit behind an admin flag.

## 5. Bin data: what really exists

**Overpass query run on 2026-10-16 at 22:32 IST** (OSM base timestamp 21:32 UTC). The bounding box was 53.120,-6.110 to 53.175,-6.040, covering Greystones, Delgany, Charlesland and north Kilcoole.

```
[out:json][timeout:60];(
 nwr["amenity"="waste_basket"](bbox);
 nwr["amenity"="waste_disposal"](bbox);
 nwr["vending"="excrement_bags"](bbox);
 nwr["waste"~"dog"](bbox);
 nwr["amenity"="recycling"](bbox););out center;
```

Results:
- `amenity=waste_basket`: **16**, nearly all clustered along Church Rd, the harbour, the seafront and the town centre (around 53.141–53.150 N, -6.059 to -6.070 W).
- `amenity=recycling`: **5** (bring banks, not litter bins).
- Dog-waste bins (`waste=dog_excrement`) and `vending=excrement_bags` dispensers: **0**.
- `amenity=waste_disposal`: **0**.
- Snapshot saved as `osm_bins_2026-10-16.geojson` in the build folder.

Other sources:
- data.gov.ie and a Wicklow County Council GIS or open-data litter-bin layer: none found. UNVERIFIED as a negative, so ask the council (see the open questions).

**Conclusion:** 16 bins for a town of about 22,000 people (population per the Litter Management Plan) is clearly incomplete, and it is all town centre. Estates, the Cliff Walk, Burnaby, Charlesland and the Kindlestown and Delgany paths have no mapped bins. **Crowd-sourced bin pins are mandatory for the MVP.** Without them, the bins-vs-fouling analysis would be misleading.

### Bin verification model
| Field | Values |
|---|---|
| `source` | `osm`, `crowd`, `council` |
| `kind` | `general`, `dog_waste`, `bag_dispenser`, `unknown` |
| `status` | `unverified` → `verified` (≥2 independent confirmations within 90 days, or a council source) → `disputed` (≥2 "not here" votes) → `removed` |
| `last_confirmed_at` | timestamp; re-verification is prompted after 180 days |

- OSM bins start as `unverified` with a weak prior (counted as 1 confirmation).
- The "Confirm bin" prompt appears when a user is within 30 m of an unverified bin: "Is there a bin here? Yes / No / It's a dog bin". It's one tap.
- Users can add a bin with a GPS pin and an optional photo. A new bin starts as `unverified`.
- Verified bins can be contributed back to OSM manually by Conor, never automatically (licence and quality reasons).
- The map shows unverified bins as hollow icons and verified bins as solid icons.
- **Coverage gauge:** the share of H3 cells (res 9, about 0.1 km²) with reports that have had at least one bin survey ("bin present" or "no bin here" confirmed). The bins analysis only shows a conclusion when coverage is ≥70%.

## 6. Bins vs fouling analysis (core feature)
**Question:** is fouling here a lack-of-bins problem? We want to answer it honestly either way.

For each report with status `spotted` or `cleared`:
- `d_bin_all` = distance in metres to the nearest bin of any status (PostGIS `ST_Distance` on geography, using a KNN `<->` index).
- `d_bin_verified` = distance to the nearest *verified* bin.
- `d_bin_dog` = distance to the nearest verified dog-waste bin.

**Distribution:** the share of reports within 50, 100 and 200 m, and beyond 200 m, plus a CDF chart. All figures are computed on verified bins, and the "all bins" figures are shown faded beside them.

**Baseline:** we generate N = 10 × reports random points inside a *walkable area mask*, rather than the raw bounding box: OSM footways, paths, roads and the beach buffered by 10 m, clipped to the Greystones MD study area. Then we compute the same distribution for the random points. Report:
- Each band as report % vs random %, with a 95% bootstrap interval (1,000 resamples).
- Interpretation rules:
  - Reports are **closer** to bins than random: fouling isn't driven by a lack of bins. Bins sit on busy routes, so this mostly reflects foot traffic. The email suggests enforcement and awareness.
  - Reports are **farther** from bins than random: there's evidence of bin gaps. The email suggests specific bin locations.
  - **No significant difference**, or coverage below 70%: "Inconclusive". Say so.
- Caveat shown in the UI: reports follow where people walk *and* report, so this is correlation and not causation. A better v2 baseline weights random points by footfall (Strava Metro or OSM path density).

**"Far from bins" hotspots:** H3 cells with ≥5 reports in 30 days whose centroid is >200 m from the nearest verified bin. They get a distinct outline, a "Candidate bin location" label and a "Suggest bin here" button. We also always list **hotspots that are within 50 m of a bin** ("bin present but still fouled"). Both lists are always shown, so the analysis can't be cherry-picked.

**Where it appears:**
- MVP metric: the % of reports >200 m from a verified bin, compared with the baseline, tracked monthly.
- Stats panel: a band chart (reports vs random), the coverage gauge, and the two hotspot lists.
- Email builder auto-stat, for example: "Of 84 reports in the last 30 days, 61% were more than 200 m from a verified bin, compared with 38% of random points on local paths. 3 hotspots (Kindlestown, Burnaby Park, Cliff Walk start) have no bin within 200 m." If the result is inconclusive or coverage is low, the stat is replaced by a neutral sentence or omitted. It is never spun.

## 7. Email builder
1. **Recipients:** Greystones MD councillors (6), envcomplaints@wicklowcoco.ie, all 32 councillors, or a custom pick. The default is the Greystones 6 plus envcomplaints. When "All" is chosen, a warning says the message should be about a county-wide issue.
2. **Template and tone:** "Polite report of a hotspot", "Request a bin at X", "Request enforcement or signage", "Follow-up: nothing has changed", and "Thank you: area cleaned". Tones are polite, firm and data-led.
3. **Auto-inserts:** hotspot stats (count, trend, median time to clear), the bin-distance stat (section 6), a deep link to the map view `https://<app>/h/<h3cell>`, links to up to 3 moderated photos (never attachments, which `mailto` can't carry), and verified citations from N9 (for example s.22 Litter Pollution Act 1997, the €250 fixed penalty, the LMP objective).
4. **Output:** `mailto:` with `to`, `cc` and `subject` and an encoded body. If the link is longer than about 1,800 characters, it falls back to copying the body plus a "copy addresses" button, and also offers a Gmail compose URL. The app **never sends**; the resident sends from their own mail client. A "Sign as" field is local only and is not stored.
5. **Guardrails:** no free-text naming of individuals (a regex and keyword check warns on house numbers and names), a rate-limit nudge ("this hotspot was emailed 3 times this week"), and a counter of how many times each hotspot has been emailed (no content is stored).

## 8. Privacy and GDPR
- **Lawful basis:** legitimate interest or consent for optional photos. There's a short privacy notice, and Conor is the controller. No accounts in the MVP: an anonymous device UUID plus a hashed IP kept for 30 days for rate limiting only.
- **Photos:**
  - Strip all EXIF metadata on the client (re-encode via canvas) *and* again on the server (`sharp`, no metadata). Keep only the GPS coordinates, which are stored in the DB column rather than in the file.
  - Run face and number-plate detection, then blur (graph node N3). Anything flagged with uncertainty is held for moderation and not shown publicly.
  - Photos are only for the mess. The prompt says "Point at the ground; no people, dogs with owners, or houses."
  - Photos are deleted 90 days after a pin is cleared.
- **No shaming:** we never accept or display owner names, dog descriptions linked to people, house numbers or vehicle details. Free-text notes are capped at 140 characters and pass a PII filter. Reports of "this person did it" are refused with a link to the council line.
- **Location precision:** public pins are shown at full precision on streets and paths. Pins inside private curtilage (OSM building or landuse=residential plot polygons) are snapped to the nearest public footpath or blurred to 25 m.
- Data subject requests go to a contact email. Data is hosted in the EU (Supabase eu-west-1 Ireland, Vercel fra1/dub1 functions).

## 9. Moderation and abuse
- Rate limits: 10 reports per device per hour and 30 per day. More than 3 reports within 20 m in 10 minutes from one device are merged.
- Shadow-pending: a new device's first 3 photos are reviewed before going public. Pins (without photos) are public immediately.
- Anyone can flag an item (wrong, offensive, private property, person visible). An item with 2 flags is hidden until reviewed.
- An admin queue in Supabase lets Conor approve, blur, delete or ban a device.
- Fake-cleared abuse: "cleared" needs either a photo or a second confirmation within 48 h. Otherwise the pin shows "reported cleared (unconfirmed)".
- Bin vandalism, where someone marks real bins "not here": disputes need ≥2 different devices, and council-sourced bins can't be disputed by the crowd.

## 10. Success metrics
- **Adoption:** 100 reports and 50 distinct devices in the first 30 days. At least 20 bin confirmations.
- **Data quality:** ≥70% bin-survey coverage of hotspot cells within 60 days. Less than 5% of pins flagged invalid.
- **Lifecycle:** ≥40% of pins marked cleared, and the median time to clear is tracked.
- **Bins analysis:** a conclusive result (significant either way) for Greystones by day 60, plus the % of reports >200 m from a verified bin compared with the baseline.
- **Civic outcome:** ≥1 council or MD response, a bin, signage or a warden patrol at a flagged hotspot within 90 days. The number of email-builder opens is a proxy for outreach.

## 11. Stack and architecture
- **Front end:** Next.js 15 (App Router) on Vercel. Lovable is fine for v0 UI scaffolding, then export to GitHub. Google Maps JS API (Maps + Advanced Markers), `@googlemaps/markerclusterer`, and H3 (`h3-js`) for hex hotspots.
- **Backend:** Supabase (Postgres 16 + PostGIS + `h3-pg` if available, otherwise compute H3 in an edge function), Storage for photos (a private bucket with signed and public-blurred variants), Edge Functions for intake and graph nodes, and `pg_cron` for stale sweeps and the weekly digest.
- **AI:** one vision model call per photo (dog-mess classifier plus face and plate detection), with a cheap model. The digest drafting LLM runs once a week.

### Data model (Postgres/PostGIS)
```sql
create table reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  device_id uuid not null,
  geom geography(Point,4326) not null,
  accuracy_m real,
  snapped_geom geography(Point,4326),
  street_name text,
  h3_r9 text,
  status text check (status in ('pending','spotted','cleared','stale','rejected','merged')) default 'pending',
  merged_into uuid references reports(id),
  confirmations int default 0,
  cleared_at timestamptz, cleared_by uuid,
  note text check (char_length(note) <= 140),
  d_bin_all_m real, d_bin_verified_m real, d_bin_dog_m real
);
create index on reports using gist(geom);

create table photos (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references reports(id) on delete cascade,
  storage_path text, public_path text,
  is_dog_mess real, has_face bool, has_plate bool,
  blurred bool default false,
  moderation text check (moderation in ('pending','approved','rejected')) default 'pending',
  delete_after timestamptz
);

create table bins (
  id uuid primary key default gen_random_uuid(),
  geom geography(Point,4326) not null,
  kind text check (kind in ('general','dog_waste','bag_dispenser','unknown')),
  source text check (source in ('osm','crowd','council')),
  osm_id text,
  status text check (status in ('unverified','verified','disputed','removed')) default 'unverified',
  yes_votes int default 0, no_votes int default 0,
  last_confirmed_at timestamptz
);
create index on bins using gist(geom);

create table bin_votes (bin_id uuid references bins(id), device_id uuid, vote text check (vote in ('yes','no','dog_bin')), created_at timestamptz default now(), primary key (bin_id, device_id));
create table bin_surveys (h3_r9 text, device_id uuid, result text check (result in ('bin_present','no_bin')), created_at timestamptz default now());
create table councillors (id serial primary key, name text, party text, district text, email text, source_url text, verified_at date);
create table citations (id text primary key, title text, quote text, url text, status text check (status in ('verified','unverified')), verified_at date);
create table hotspots (h3_r9 text, period_start date, report_count int, centroid geography(Point,4326), d_bin_verified_m real, far_from_bin bool, near_bin_still_fouled bool, primary key (h3_r9, period_start));
create table bin_analysis_runs (id serial primary key, run_at timestamptz default now(), n_reports int, coverage real, bands jsonb, baseline_bands jsonb, ci jsonb, verdict text);
create table flags (id serial primary key, target_type text, target_id uuid, device_id uuid, reason text, created_at timestamptz default now());
create table email_opens (h3_r9 text, template text, opened_at timestamptz default now());
create table graph_runs (id uuid primary key, kind text, state jsonb, status text, created_at timestamptz default now());
```
Row-level security (RLS): anonymous users can insert into `reports`, `bin_votes`, `bin_surveys` and `flags`, and can only read public views (`v_public_reports`, `v_bins`, `v_stats`). Everything else is service-role only.

## 12. Estimated costs (monthly, MVP scale)
| Item | Estimate | Notes |
|---|---|---|
| Google Maps JS API, Dynamic Maps | €0 | Since March 2025 Google gives a per-SKU free monthly quota (about 10,000 free Dynamic Maps loads per month on the Essentials tier). Greystones scale is far below that. Set a budget alert and an API-key HTTP-referrer restriction. **Check the current SKU quota at https://mapsplatform.google.com/pricing before launch.** |
| Geocoding / Roads API (snap to street) | €0 | Avoid them: snap with PostGIS against OSM footways instead. |
| Supabase | €0 (Free) → €25 (Pro) | Free tier pauses after inactivity, so use Pro once public. |
| Vercel | €0 (Hobby) | Hobby is non-commercial. Fine for a civic project. |
| Vision model calls | under €5 | Roughly 300 photos/month at a fraction of a cent each. |
| Domain | about €15/year | e.g. greystonespoomap.ie (.ie needs an Irish connection, which Conor has) |
| **Total** | **€0–€30/month** | |

## 13. Weekend MVP milestone plan
- **Fri evening (2 h):** Supabase project in eu-west-1 with PostGIS, schema plus RLS, seed councillors and verified citations, OSM bin import (16 + 5 bring banks, flagged `unverified`). Google Maps key with referrer lock.
- **Sat morning (4 h):** Next.js map page: geolocate, one-tap pin, drag to adjust, red, green and grey markers, clustering, bin layer with hollow and solid icons.
- **Sat afternoon (4 h):** Photo upload with client-side EXIF strip, then the intake edge function (N1–N5: validate, classify and blur, dedupe, snap, nearest-bin distance). Moderation queue (Supabase table plus a simple admin page).
- **Sun morning (4 h):** Bin confirm and add flow, bin surveys, the H3 hotspot job, the bins vs random analysis (SQL plus an edge function), and the stats panel.
- **Sun afternoon (3 h):** Email builder (templates, recipients, auto-stats, `mailto` and copy fallback), privacy page, rate limits, deploy to Vercel. Soft launch to 10 friends and the Tidy Towns group.
- **Week 2:** stale lifecycle cron, weekly digest draft for Conor (human sends), first bin-survey walk with volunteers to lift coverage.

## 14. Risks
| Risk | Mitigation |
|---|---|
| Bin data too sparse, so the bins analysis is misleading | Coverage gauge, an "inconclusive" verdict when coverage is below 70%, bin-survey walks |
| The analysis is biased by foot traffic and reporting behaviour | Walkable-area baseline, a stated caveat, a footfall-weighted baseline in v2 |
| Photos identify people or houses | Two-stage EXIF strip, face and plate blur, held for moderation when uncertain, deletion after 90 days |
| Harassment or neighbour disputes | No names, PII filter, refuse "who did it" reports, flag and hide |
| Spam or fake reports | Device rate limits, dedupe, confirmations, shadow-pending photos |
| Councillors feel spammed | Email counters and nudges, a default to the 6 MD councillors, a weekly digest rather than per-report emails |
| Google Maps cost surprise | Budget cap, quotas and a referrer lock. Fallback to MapLibre plus OSM tiles. |
| Low adoption | Seed via Tidy Towns and local Facebook and WhatsApp groups, QR stickers on lamp posts (with council permission) |
| Stale councillor list or law | Quarterly re-check job, a `verified_at` date on every row, citations need status=verified |

## 15. Open questions for Conor
1. Study area: Greystones MD only (Greystones, Delgany, Kilcoole, Newtownmountkennedy), or Greystones and Delgany only for the MVP?
2. Should we ask Greystones MD office or the Environment section for their internal litter-bin and dog-bin asset list (an FOI or informal request)? It would turn the bins analysis from crowd-only into council-verified.
3. Do you want to co-brand with Greystones Tidy Towns, or keep it independent?
4. Lovable for the first scaffold, or straight Next.js?
5. A domain name preference?
6. Should the weekly digest email be drafted to you only, or also offered publicly?
