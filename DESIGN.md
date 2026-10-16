---
name: Civic Tide
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#3d4a42'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#6d7a72'
  outline-variant: '#bccac0'
  surface-tint: '#006c4a'
  primary: '#006948'
  on-primary: '#ffffff'
  primary-container: '#00855d'
  on-primary-container: '#f5fff7'
  inverse-primary: '#68dba9'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#8d4b00'
  on-tertiary: '#ffffff'
  tertiary-container: '#b15f00'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#85f8c4'
  primary-fixed-dim: '#68dba9'
  on-primary-fixed: '#002114'
  on-primary-fixed-variant: '#005137'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#ffdcc3'
  tertiary-fixed-dim: '#ffb77d'
  on-tertiary-fixed: '#2f1500'
  on-tertiary-fixed-variant: '#6e3900'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display:
    fontFamily: Plus Jakarta Sans
    fontSize: 34px
    fontWeight: '800'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  title-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 22px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.04em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 30px
    letterSpacing: -0.01em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-mobile: 0.75rem
  margin: 1rem
  margin-tablet: 1.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system channels the resilient, coastal character of Greystones, County Wicklow, synthesized with the sharp urgency of grassroots civic mobilization. It rejects the passive, bureaucratic aesthetic of traditional municipal portals in favor of a modern, high-contrast, action-first interface. 

The aesthetic sits at the intersection of **Tactile Modernism** and **Utility-Driven Civic Tech**:
- **Tactile Modernism**: Interactive controls feel tangible, authoritative, and direct. Cards possess distinct surface bounds with crisp ambient delineation, resembling physical public notice boards refactored for rapid mobile interaction.
- **Urgent & Communal**: High-salience alerts (planning objections, coastal water quality, sewage overflows, transit bottlenecks) pierce through clean, maritime neutrals. Visual cues drive immediate clarity without eliciting panic.
- **Accessible & Localized**: Interfaces accommodate varied outdoor lighting conditions (harbor daylight, evening commuter rail) via strict contrast standards and clear typographic scale.

## Colors

The palette directly references the East Coast of Ireland: deep Irish Sea slate, vivid coastal seagrass emerald, and sharp utilitarian amber and crimson accents.

### Palette Architecture
- **Primary (`#059669` - Civic Emerald)**: The anchor of positive civic impact, resolution, and endorsed communal initiatives. Used for primary calls-to-action, success states, and positive status metrics.
- **Secondary (`#0F172A` - Irish Sea Navy)**: The bedrock tone used for high-contrast headers, structural navigation shells, and bottom navigation bars. Provides civic gravitas and visual anchor.
- **Tertiary (`#D97706` - Warning Amber)**: Highlights pending civic actions, infrastructure delays, and community alerts requiring council attention.
- **Neutral (`#64748B` - Wicklow Slate)**: Balances secondary metadata, subtle dividers, inactive tabs, and supporting icon frames.

### Semantic & Environmental Accents
- **Canvas (`#F8FAFC`)**: Soft, clean marine-tinted white that minimizes glare during outdoor beach/commuter usage.
- **Surface Elevation (`#FFFFFF`)**: Pure high-contrast white card surfaces, framing actionable civic items.
- **Urgent Alert (`#DC2626`)**: Reserved strictly for raw sewage discharges, urgent planning objection deadlines, and public safety notices.
- **Environmental Hazard (`#78350F`)**: Dedicated accent color for water pollution notices, dog-waste hotspots, and coastal runoff tracking.

## Typography

The type system blends the energetic, humanist geometry of **Plus Jakarta Sans** with the structural legibility of **Inter**.

- **Display & Headlines (Plus Jakarta Sans)**: Conveys an approachable, civic-minded confidence. Tight letter tracking and sturdy geometric proportions prevent loss of legibility in high-density community feeds and urgent petition tallies.
- **Body & Longform (Inter)**: Handles local council transcripts, community feedback threads, and planning impact statements. Neutral x-height ensures strain-free reading on small handheld displays.
- **Labels & Microcopy (Plus Jakarta Sans)**: Set in semi-bold and bold weights with slightly expanded tracking for fast scanning in metadata tags, floating action chips, and map markers.

## Layout & Spacing

The layout is built primarily around a dynamic mobile fluid grid that scales seamlessly up to tablet dimensions.

### Grid & Canvas Structure
- **Mobile Handheld (up to 599px)**: 4-column fluid layout with `margin: 1rem` and `gutter-mobile: 0.75rem`. Content stacks vertically, giving primacy to real-time maps and cards with quick swipe actions.
- **Tablet / Large Viewport (600px - 1024px)**: 8-column layout with `margin-tablet: 1.5rem` and `gutter: 1rem`. Map views and list cards sit side-by-side in split master-detail viewports.
- **Vertical Rhythm**: Built upon a 4px/8px modular scale. Component internal padding strictly uses the `space-*` tokens to maintain rhythmic parity across all cards, banners, and floating sheets.

### Map & Canvas Dynamics
Full-screen interactive maps utilize edge-to-edge rendering with interface elements positioned using fixed inset padding (`space-md`) above the bottom navigation bar and operating system safe areas.

## Elevation & Depth

Visual hierarchy uses **tonal layering combined with subtle, slate-tinted ambient shadows**, creating a crisp separation between the map viewport and actionable interface sheets.

### Elevation Levels
- **Level 0 (Base Canvas & Map Surface)**: Flat `#F8FAFC` canvas or interactive map tile layer.
- **Level 1 (Content Cards & Informational Tiles)**: `#FFFFFF` surface accompanied by a 1px solid stroke (`#E2E8F0`) and an ambient drop shadow: `0 2px 4px -1px rgba(15, 23, 42, 0.05), 0 1px 2px -1px rgba(15, 23, 42, 0.03)`.
- **Level 2 (Floating Map Controls & Filter Pills)**: `#FFFFFF` floating state over map viewports. Drops a distinct, diffused lift: `0 8px 16px -2px rgba(15, 23, 42, 0.08), 0 4px 6px -2px rgba(15, 23, 42, 0.04)`.
- **Level 3 (Modal Bottom Sheets & Urgent Action Drawers)**: `#FFFFFF` top-tier drawer with deep ambient shadow: `0 20px 25px -5px rgba(15, 23, 42, 0.12), 0 8px 10px -6px rgba(15, 23, 42, 0.08)`. Features a 40% opacity `#0F172A` backdrop scrim.

## Shapes

The design system employs a **Rounded (`2`)** shape profile (`0.5rem` / `8px` default radius). 

### Corner Radius System
- **Base Components (`0.5rem` / `8px`)**: Form inputs, action buttons, alert toasts, and map controls.
- **Large Containers (`rounded-lg: 1rem` / `16px`)**: Community cards, issue reporting modules, and incident containers.
- **Overlays (`rounded-xl: 1.5rem` / `24px`)**: Top corners of modal bottom sheets and floating action hub menus.
- **Full Radius (Pill / Fully Rounded)**: Status chips, floating category filter tags, and counter badges.

## Components

### Buttons
- **Primary Action (Empowerment / Sign / Vote)**: Filled with Civic Emerald (`#059669`), white text, bold font (`label-lg`), `0.5rem` border radius, minimum touch target of 48px height. Active states shift to `#047857`.
- **Urgent Action (Report / Object)**: Filled with Alert Crimson (`#DC2626`) or Warning Amber (`#D97706`), contrasting text, accompanied by an explicit icon or emoji.
- **Secondary / Council Tier**: Border-only variant with 1.5px solid Irish Sea Navy (`#0F172A`) outline and dark navy typography.

### Chips & Status Indicators
- **Emoji Status Chips**: Pill-shaped badges combining an emoji glyph and compact label (`label-sm`).
  - *Active Issue*: Amber tinted background (`#FEF3C7`), text and icon in `#92400E` (e.g., `⚠️ Delayed`).
  - *Sewage / Water Warning*: Hazard background (`#FEF2F2`), text in `#991B1B` (e.g., `🌊 Red Flag`).
  - *Resolved / Clean*: Emerald background (`#D1FAE5`), text in `#065F46` (e.g., `✅ Action Taken`).

### Cards & Civic Post Units
- High-contrast white container (`#FFFFFF`) with a 1px border (`#E2E8F0`) and `1rem` corner rounding.
- Organized vertically: Top row holds the localized location badge (e.g., "South Beach", "Whitshed Road") and emoji status chip; middle holds bold heading (`headline-sm`) and brief summary; bottom row houses the engagement metadata (signatures gathered, days left) and primary action trigger.

### Form Inputs & Checkboxes
- **Input Fields**: 48px height, `#FFFFFF` background, 1.5px border (`#CBD5E1`), focus state glows with a 2px ring of Civic Emerald (`#059669`). Placeholders set in `#94A3B8`.
- **Civic Checkboxes & Radios**: 20px squares/circles with a 2px border. Checked state fills with `#059669` featuring an interior white geometric checkmark.

### Map Floating Controls
- Squircle floating circular/rounded-square triggers (44px x 44px) placed on elevation level 2, featuring an Irish Sea Navy icon (`#0F172A`) against a white glass or solid white surface, enabling quick incident tagging, location recalibration, and category layering.