# Clean Greystones — Dog Fouling Map, Bin Audit & Civic Action

> **Live Application:** [https://cleangreystones.ie](https://cleangreystones.ie)  
> **Mission:** Turning everyday walking frustration into undeniable communal evidence to get real dog warden enforcement and bins across Greystones, Delgany, and Charlesland.

---

## 👶 The Story & Grassroots Mission

If you've ever pushed a buggy down Church Road, navigated a scooter through Burnaby Park, or walked along the South Beach promenade while playing what feels like extreme pavement hopscotch, you already know the problem.

Cleaning dog muck out of pram treads or kid's school shoes at 8:45 AM isn't just frustrating — it's a public health hazard that happens week in, week out. When residents raise it, the usual response is vague promises or claims that *"we have plenty of bins"* and *"there's no evidence"*.

**Clean Greystones** was built to change that. The app was literally vibe-coded late into the night by a local Greystones dad ([Conor Redmond](https://github.com/Redser06)) out of pure love for his wife and kids — after one too many morning school-run emergencies picking dog muck out of pram treads and school shoes with a twig. What started as loving, late-night AI vibe-coding to solve a household headache has turned into a full-scale civic evidence platform shared across local parent groups (including the Greystones **"Mother Knows Best"** WhatsApp community).

Instead of venting into the void, every tap gives residents a 5-second way to log fouling spots right from their phone and builds an undeniable, geotagged evidence dossier that connects directly to our 6 Greystones Municipal District councillors.

---

## 📱 The Community WhatsApp Launch Message

*(Shared with local communities, school gates, and parent groups like "Mother Knows Best")*

> *"Ladies (and fellow buggy slalom champions 🏆👶)!*
>
> *If anyone else is sick of treating a casual walk down Church Road or the South Beach prom like an Olympic minefield for pram wheels, scooters, and school shoes…*
>
> *My husband Conor has literally spent his evenings vibe-coding an entire web app for us out of pure love (and because he was determined that neither of us ever has to scrub dog poo out of pram treads with an old toothbrush at 8:45 AM ever again 😂💻❤️).*
>
> *👉 **https://cleangreystones.ie***
>
> *You don’t even need an app store — just open the link on your phone and tap **Add to Home Screen** (or Install). Done!*
>
> *It’s **100% anonymous** (no sign-ups, no logins, no names). Next time you spot a landmine or have a near-miss, just tap the map in 2 seconds:*
> *• 💩 Uncollected drop*
> *• 👶 Buggy / stroller wheel strike*
> *• 👟 Stepped in*
> *• ♿ Wheelchair hazard*
>
> *The app automatically tracks how close it was to the nearest public bin (spoiler: 70%+ happen within 15 metres of a bin!).*
>
> *Best part: in one tap, we can send a joint, data-backed email to all 6 Greystones councillors demanding real warden patrols and enforcement. The more of us logging over the next week or two, the bigger the message we deliver.*
>
> *Let’s reclaim the footpaths! Please share with your buggy-walking and dog-walking pals! 🐾👶✨"*

---

## 🚀 Key Features

### 1. Zero-Friction Mobile Web App (PWA)
- **Install from Web:** No Apple App Store or Google Play download required.
  - **iPhone (Safari):** Tap the **Share** button (`⎋`) $\rightarrow$ tap **Add to Home Screen**.
  - **Android (Chrome):** Tap the **Install** prompt or menu ($\vdots$) $\rightarrow$ **Install / Add to Home screen**.
- Operates full-screen with offline caching, fast boot times, and instant home-screen launch.

### 2. 1-Tap Anonymous Logging
- **Four Clear Categories:**
  - `💩` **Just Poop (Uncollected)**
  - `👶` **Buggy / Stroller Wheels (Direct Contamination)**
  - `👟` **Stepped In by Pedestrian**
  - `♿` **Wheelchair Hazard**
- **100% Anonymous & Privacy-First:**
  - No user accounts, phone numbers, or emails collected.
  - Each phone generates a private, cryptographically verified anonymous token (`GS-ANON-XXXX-XXXX`) stored only on the device to prevent duplicate bot flooding while guaranteeing total privacy.

### 3. 24-Hour Clean Slate & Corroboration Engine
- **Daily Fresh View:** Shows today's active 24-hour drops by default so residents see a clean, actionable view of current walks rather than a cluttered wall of old pins.
- **15-Metre Spatial Corroboration:** When two or more residents log the same drop on the same footpath within 24 hours, the engine automatically merges them into a single pin with a `×2` or `×3` confirmation badge and elevates the severity to stroller/wheelchair level.
- **7-Day Cumulative Evidence:** Full weekly rolling statistics are archived for councillor briefings and accessible in the hamburger menu (`Weekly Area Report`).

### 4. Public Bin Proximity & Ground-Truth Registry
- **Automated Distance Calculation:** Every logged drop immediately computes Haversine distance in metres to the nearest verified council bin.
- **Ground-Truth Council Audit (`/admin`):** Organisers can manually log, verify, and GPS-audit municipal bins across Greystones (Church Rd, South Beach, Marina, Burnaby, Kindlestown, Charlesland) to empirically counter the *"there are plenty of bins"* argument.

### 5. 30-Second Councillor Email Action
- **One-Tap Pre-Addressing:** Pre-populates all 6 elected Greystones Municipal District councillors:
  - `sstokes@wicklowcoco.ie`, `lscott@wicklowcoco.ie`, `ofinn@wicklowcoco.ie`, `tfortune@wicklowcoco.ie`, `lfenelongaskin@wicklowcoco.ie`, `mbarry@wicklowcoco.ie`
  - CC to Wicklow County Council Environment & Litter divisions: `envcomplaints@wicklowcoco.ie`, `GreystonesMD@wicklowcoco.ie`, `env@wicklowcoco.ie`.
- **Two Flexible Modes:**
  1. **Prefilled Letter:** Practical Solutions & Resources (cites dog warden shortages, Tánaiste local commitments, and buggy/wheelchair health impacts).
  2. **Write Your Own:** Automatically fills recipient headers and lets the resident type their own personal story or send straight from their phone's native mail app.

---

## 🛠️ Architecture & Tech Stack

- **Framework:** React 18 + TypeScript + Vite
- **Styling:** Tailwind CSS (Coastal Green `#006948` theme with accessible contrast and touch-first 44px+ tap targets)
- **Mapping:** Leaflet & Google Maps Hybrid Tile Layers with device geolocation snapping
- **Persistence & Cloud Sync:** 
  - Local-first IndexedDB / LocalStorage fallback
  - Real-time Cloud Firestore sync (`clean_greystones_reports`, `clean_greystones_bins`, `clean_greystones_events`)
- **Hosting & Infrastructure:** Firebase Hosting + Google Trust Services SSL on `https://cleangreystones.ie`

---

## 🧪 Verification & Development

To run the project locally or verify changes:

```bash
# Clone the repository
git clone https://github.com/Redser06/clean-greystones.git
cd clean-greystones

# Install dependencies
npm install

# Type check
npm run typecheck

# Run test suite (33 unit & integration tests)
npm test

# Build production bundle
npm run build
```

---

## 📜 License & Governance

Built for the community of Greystones, Co. Wicklow. Open-source, non-commercial civic initiative released under the [MIT License](LICENSE).
