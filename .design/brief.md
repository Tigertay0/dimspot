# Design Brief: Outage Tracker, landing (Lights Out)

Built from `.design/picks.md` (direction B, the user's board choice). App and ad briefs get added as sections 11-12 when those stages start.

## 0. Job
- **Type:** scroll experience (secondary: landing).
- **Builder mode for averlo-studio:** scroll.
- **Stack:** the project's own (Next.js 16 App Router + Tailwind v4). Add `motion`. Scroll-linked work uses Motion `useScroll` / `useTransform` instead of the scroll-craft engine, because this is an existing React app; the scroll-craft spine still governs it (journey, feeling curve, one peak, device variety).
- **Core function:** Outage Tracker puts power, internet and cellular outages on one live map. People report what is down where they are and confirm what others report, so they can tell whether it's their router or the whole street.
- **Primary action:** "Open the live map", linking to `/map`. One label everywhere. The nav button reads "Live map".
- **What the visitor must believe by the end:** when the lights go out, this is where you find out whether it's just you, and you can help your street find out too.
- **Existing brand to keep:**
  - the name "Outage Tracker"
  - the severity semantics (complete / degraded / intermittent / resolved)
  - the demo-data honesty: the landing shows demo numbers only as clearly labeled examples
- **Routes:** the landing page becomes `app/page.tsx` at `/`. The current map shell moves to `app/map/page.tsx` at `/map`, and every link, manifest `start_url`, service-worker and push deep link that pointed at `/` for the map is updated to `/map`.

## 1. Direction
- **Character:** hushed, cinematic, neighbourly.
- **World:** a city at dusk, sodium streetlights, power lines against an orange sky, the quiet when everything goes dark.
- **Theme:** mixed. Dusk light (acts 1-2) → night (acts 3-5) → lights back on (act 6, the ground returns to dusk). It differs from the last registry row (dark, restrained, one ember accent) on theme, palette, display type, hero device and signature motion.
- **Palette strategy:** Full palette, built analogous plus a pop: warm dusk tones running to deep night, with sodium as the pop.
- **Signature moment (the peak, act 3):** a pinned dusk panorama whose city lights switch off street by street as you scroll. A glowing outage boundary traces itself over the dark area.
- **Supporting moments:**
  - (1) the opening orbit: a canvas globe with pulsing outage markers, descending into the city through a zoom parallax
  - (2) a sticky phone that swaps report → confirm → it's back
  - (3) act 6: the lights come back on as the closing call to action arrives
- **Tell-someone sentence:** "It's the site where the city goes dark street by street as you scroll, then lights back up when you report it."
- **Signature detail:** sodium is the color of light itself. Lit windows, streetlights and the primary button are all sodium, so the button reads as the one light you can switch on. It appears nowhere else.
- **The rut we refuse:** a status-page grid of colored dots with "All systems operational", or a hero with a map screenshot and three feature cards.
- **References, blended (one mechanism each):**
  - godly: Set Space (https://godly.design/website/set): a photographic dusk landscape carrying location points → the panorama with sodium points
  - godly: Solidroad (https://godly.design/website/solidroad): a glowing line traced across terrain → the outage boundary drawing itself over the dark streets
  - godly: Arrakis (https://godly.design/website/arrakis): a calm horizon arc → the arc that tops the closing section
  - 21st: Interactive Globe (10073): the opening orbit
  - 21st: Zoom Parallax (5967): the descent

  The fusion, which none of the sources does: the scroll *is* the outage. The page's own lighting state changes with the story.

## 2. Color
| Role | Hex | Notes |
|---|---|---|
| Dusk (ground, light) | #F4E9DC | acts 1, 2 and 6 |
| Dusk deep (surface on dusk) | #EADCCB | cards and chips on dusk |
| Night (ground, dark) | #0C1222 | acts 3-5 |
| Night raised | #151C30 | cards on night; Night + 1 step |
| Night high | #1E2740 | raised controls on night |
| Ink (text on dusk) | #161A26 | primary text on dusk, about 15:1 |
| Ink soft (secondary on dusk) | #4A4F5E | at least 7:1 on Dusk |
| Lamp white (text on night) | #FFF6E5 | primary text on night, about 17:1 |
| Lamp soft (secondary on night) | #B9BBC6 | at least 7:1 on Night |
| Hairline | text color at 10% | both themes |
| Horizon (brand) | #E7A39A | dusk sky, the arc, chapter numerals in the sky gradient only |
| Dusk violet (brand) | #6E5A8A | top of the sky gradient only (sky → Horizon → Dusk); never a purple-blue UI glow |
| Sodium (brand + Action) | #FFB21A | the city's lights in imagery and the primary CTA fill; nothing else in UI |
| Text on Sodium | #0C1222 | about 10.8:1 |
| Outage boundary line | #FFB21A at 90% | drawn line over the dark panorama, with a 2px core and a soft 12px blurred copy beneath (a light, not a UI glow) |

Severity (cards in act 5 only, unchanged meaning): complete hsl(0 72% 45%), degraded hsl(24 90% 40%), intermittent hsl(38 92% 33%), resolved hsl(142 55% 32%). On Night, use their lightened variants with at least 4.5:1, defined as tokens.

**Color moments (4):**
1. the dusk sky gradient behind the globe
2. sodium lights over the photo
3. the background tweening from Dusk to Night across act 3
4. the tween back from Night to Dusk in act 6

## 3. Typography

> **Updated 2026-11-04 by user direction.** The user called the original fonts "horrible", so the whole site and the /map app now use **Geist** (display, weight 600, tracking -0.04em) and **Geist Mono**. The Gloock and Schibsted table below is history; read every "Gloock" as Geist 600 and every "Schibsted" as Geist.
- **Gloock** for display: https://fontesk.com/gloock-font/. OFL, free for commercial use, web embedding allowed. Load with `next/font/google` (`Gloock`), weight 400.
- **Schibsted Grotesk** for text: https://fontesk.com/schibsted-grotesk-typeface/. OFL. Load with `next/font/google`, weights 400, 500 and 600.

| Role | Size (desktop / mobile) | Line height | Tracking | Face, weight |
|---|---|---|---|---|
| Hero | clamp(48px, 8vw, 112px) | 0.98 | -0.02em | Gloock 400 |
| Chapter headline (H2) | clamp(36px, 5.2vw, 76px) | 1.04 | -0.02em | Gloock 400 |
| H3 / card title | 24px / 22px | 1.2 | -0.01em | Schibsted 600 |
| Lead | 20px / 18px | 1.5 | 0 | Schibsted 400 |
| Body | 17px / 16px | 1.6 | 0 | Schibsted 400 |
| Small / meta | 14px | 1.5 | 0.01em | Schibsted 500 |
| Figures | per role | | | Schibsted, tabular-nums |

Sentence case throughout. No eyebrows and no section numbers.

## 4. Spacing, radius, depth
- **Spacing:** 4px scale (4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 160). Container max width 1200px. Page gutter 24px (16px under 640px).
- **Section padding:** acts that don't pin get 128px top and bottom on desktop, 96px on mobile.
- **Radius:** controls 12, cards 20, phone frame 40 (inner screen 32: 40 minus 8 padding). No pills except the round icon-only buttons.
- **Buttons:** primary 48px tall with 24px horizontal padding; nav button 36px tall with 16px. Primary fill is Sodium with Night text, hover #FFC24D, pressed scale 0.97. Disabled at 50% opacity. Focus ring 2px Lamp white (on night) or Ink (on dusk) with a 3px offset.
- **Depth:** night sections use surface steps plus hairlines, no shadows. Dusk sections use `0 8px 24px rgba(22,26,38,0.08)` on the phone and cards. Text on photos sits on a gradient scrim under the text plus a progressive blur (`backdrop-blur-[12px]` masked by a gradient). Glass appears only on the nav once it sits over the photo.

## 5. Layout, act by act (journey, feeling curve, peak)

| Act | Beat | Feeling, and what on screen causes it | Device | Span |
|---|---|---|---|---|
| 1 Orbit | Recognition | curious calm: a slow globe at dusk, sodium points pulsing where outages are | canvas globe + load headline reveal | 100vh |
| 2 Descent | Arrival | quiet wonder: falling from orbit into a real city at dusk | zoom parallax | 160vh |
| 3 Lights out (PEAK) | Tension | unease: the lights go out street by street, and the page turns to night | pinned, scroll-linked canvas over the photo | 260vh, the longest |
| 4 Find out | Turn | control: you can tell if it's just you | sticky phone, steps swapping | 220vh |
| 5 Your street, every service | Substance | trust: people plus official feeds, power, internet and cellular | photo with scrim + expandable outage cards | auto, about 140vh |
| 6 Lights back on | Commitment | relief: the city relights as the button appears | short scroll-linked relight + horizon arc | 120vh |

Seven devices across six acts, no device twice in a row. The total scroll is about 10.4 viewport heights, outside the 13.6-13.8vh band.

**Act 1, Orbit (dusk, light):**
- **1-2-3:**
  1. the globe, right of center, 55% of the width on desktop
  2. the hero headline, left
  3. the lead line and the CTA
- **Z-pattern:** logo top-left, Live map button top-right, headline left, globe right, CTA under the headline.
- **Copy:**
  - Headline: "When the lights go out, find out if it's just you"
  - Lead: "Power, internet and cell outages, reported by the people living them and confirmed on one live map"
  - CTA: Open the live map
- **Background:** a vertical sky gradient (Dusk violet #6E5A8A at the top → Horizon #E7A39A at 55% → Dusk #F4E9DC at the bottom), with a 4% film-grain layer.
- **Mobile:** the globe goes above the headline at 280px, and the CTA sits within the first 844px.

**Act 2, Descent:**
- Zoom Parallax with the panorama `DxHR8K5Egjk` as the center layer, plus two cropped detail layers taken from the same photo at different zoom rates.
- A single line fades in at 60%: "Somewhere down there, a street is about to go quiet".
- No other UI.

**Act 3, Lights out (PEAK):**
- Pin the panorama for 260vh.
- Overlay a canvas of about 600 sodium light points placed over the photo's lit areas, deterministic by seed. Points switch off in clusters, west to east, mapped to scroll progress 0.15-0.75.
- The photo's brightness filter eases from 1 to 0.35, and a Night tint fades in to 70%.
- A Solidroad-style glowing outage boundary (an SVG path) draws itself with `stroke-dashoffset` around the dark area from 0.55 to 0.85.
- The page background behind the pin tweens Dusk → Night.
- **Copy:**
  - Chapter headline (cut reveal): "Your street just went dark"
  - Line at 0.8: "Is it the whole block, or just your router?"
- **Text placement:** bottom-left over a scrim with progressive blur.
- **Reduced motion:** two static frames side by side (lit and dark), the boundary already drawn.

**Act 4, Find out (night):**
- Scroll 01 pattern. The text column is on the left with three steps.
- The sticky phone on the right shows real app UI rebuilt as JSX at phone scale (not div rectangles: real components with real copy and demo data). Its screen swaps between:
  - Report: "What's down?", with Power, Internet and Cell options, then "Here" pinned on the map
  - Confirm: "3 neighbours see this too" and a Confirm button
  - It's back: "Power restored on Elm St · 2h 14m"
- **Step copy:**
  - "Report what's down, in two taps"
  - "See who else has it, and confirm"
  - "Get told the moment it's back"
- The chapter headline (cut reveal): "Find out in seconds".

**Act 5, Your street, every service (night):**
- The pylon photo `pu848r_eCpI` sits full-bleed in the top half, with the Wave Lines ambient (B6, Lamp soft at 25% opacity) over its sky. The headline sits on the scrim and blur: "Reports from your neighbours, checked against official feeds".
- Below it, three Expanded Map cards (B5), one each for power, internet and cell. Each shows a severity chip, the place, the time and the confirmations as clearly labeled demo data ("Example"), and opens into a real MapLibre mini map of the area on click.
- The section's numbers are labeled "Example". No real statistics are claimed.

> **Updated 2026-11-04 by user direction.** The user rejected the photo panorama and the colour tweens in acts 3 and 6 ("very bad", "weird photo"). Act 3 and act 6 are now a canvas street map in the app's night style (`street-grid.tsx`): lights go out block by block with the app's dashed outage boundary, then relight from the edges in. Act 6 **ends on Night, not Dusk**. Do not reintroduce the Night → Dusk tween or the panorama without asking the user. Colour moment 4 is now the street relighting in sodium.

**Act 6, Lights back on (night → dusk, superseded above):**
- The panorama returns at 60vh tall. Its sodium points relight east to west as the section enters (scroll-linked, 0-0.6), and the ground tweens Night → Dusk.
- The Arrakis-style horizon arc (an SVG ellipse stroke, Horizon color) tops the section.
- **Copy:**
  - Headline: "It's back on. Help your street know first"
  - The CTA (Sodium): "Open the live map"
  - Secondary text link: "How reports work", linking to the act 4 anchor
- The footer below: Ink on Dusk, with links to Map, Settings (alerts) and the GitHub/README (if public), plus the photo credits.

## 6. Components (21st.dev)

### Sweep log (20 searches across 12 categories, run in design-scout)
| Category | Queries | Candidates (id) | Pick | Why |
|---|---|---|---|---|
| Hero / globe | interactive globe hero | 5813, 10073, 1128, 20053 | 10073 | pure canvas, markers and arcs, zero deps |
| Background / map | dot map background world | 999, 21985, 27474, 23412 | 21985 (as a card) | expands into a real map |
| Background | shader background animated; signal wave lines background | 2510, 30975, 43046, 24116, 39083, 1823, 7625 | 39083 | power-line feel, pointer-reactive |
| Text animation | scroll text reveal kinetic typography | 23571, 9982, 18595, 27425 | 18595 | clip-path cut fits "lights cutting out" |
| Scroll | zoom parallax scroll; horizontal scroll section; sticky scroll feature cards | 5967, 2544, 1224, 20039, 18041, 12461, 20139, 19168, 2077, 25296 | 5967, 18041 | descent, sticky phone |
| Numbers | number ticker animated counter | 21513, 21515, 20459 | not used (no real stats) | |
| Status | status indicator live pulse | 24882, 25394, 19202 | app stage | |
| App feed | activity timeline feed | 28340, 29394, 35051 | app stage | |
| Navigation | animated dock navigation | 19177, 18014, 1972 | not used | |
| Button | magnetic button cta | 26725, 1507, 27157 | not used; Sodium press button instead | |
| Showcase | testimonial marquee | 1198, 27530, 24457 | not used (no real testimonials) | |
| Close | animated footer cta | 23164, 26705, 33924 | not used | |
| Templates | landing page template | 1121, 1333, 1299, 1195 | none | |
| Cards | bento grid features animated | 9594, 9205, 622 | not used | |
| Showcase | radar sweep animation | 10759, 8355, 2353 | not used | |

### Adopted (6: 1 background, 3 animated, 1 interactive, 1 signature)
| Use | Component | id / URL | Motion layer | Restyle |
|---|---|---|---|---|
| Act 1 globe | Interactive Globe | 10073, https://21st.dev/@dev.yadhakim/components/interactive-globe | signature (opening) | dots Ink at 35% alpha on dusk; markers Sodium with Ink labels at 12px Schibsted; arcs Horizon at 50%; remove its blue outer glow and the demo card/gradient text; pause offscreen; under reduced motion it stops rotating and keeps markers static |
| Act 2 descent | Zoom Parallax | 5967, https://21st.dev/@efferd/components/zoom-parallax | scroll | images from the panorama only; no rounded corners on layers; scale ranges tuned to a 160vh section |
| Act 4 phone | Scroll 01 (sticky media) | 18041, https://21st.dev/@felipemenezes098/components/scroll-01 | scroll | media is the JSX phone; crossfade 300ms with the project curve; text column Lamp on Night |
| Headlines, acts 3, 4, 6 | Vertical Cut Reveal | 18595, https://21st.dev/@cnippet-dev/components/vertical-cut-reveal | scroll (text) | by word, 40ms stagger, 600ms, once; Gloock |
| Act 5 cards | Expanded Map | 21985, https://21st.dev/@dev.shejanmahamud/components/expanded-map | interaction | MapLibre with the project's no-token style instead of its tiles; tilt capped at 6°; Night raised surface; severity chip; "Example" label |
| Act 5 ambient | Wave Lines | 39083, https://21st.dev/@balick/components/wave-lines | ambient | Lamp soft at 25%; sky area only; pause offscreen; static under reduced motion |

## 7. Motion
- **Curve:** `cubic-bezier(0.16, 1, 0.3, 1)`. **Durations:** 150ms feedback, 200ms menus, 400ms entrances, 600-800ms one-time reveals.
- **Signature (act 3)** and **load moment** (act 1 headline cut reveal plus the globe fading up over 800ms).
- **Scroll devices per act**, as in the table in section 5. No device is repeated in adjacent acts.
- **Interaction:**
  - the globe can be dragged
  - the Expanded Map cards tilt toward the pointer and open on click
  - the Sodium button is press-scale only (no magnetic pull, which would fight the calm)
- **Ambient:** Wave Lines only, in act 5.
- **Reduced motion:** every act has a static composition (described per act). No pinning under reduced motion; act 3 shows its lit and dark frames side by side.
- **Performance:**
  - the panorama is a `next/image` priority image in act 2, lazy elsewhere
  - canvases are capped at device pixel ratio 2 and paused offscreen
  - no layout shift; LCP under 2.5s on the act 1 headline

## 8. Imagery (Unsplash License, free; verified not Unsplash+ via the download redirect)
- **Panorama:** https://unsplash.com/photos/DxHR8K5Egjk, served as `images.unsplash.com/photo-1530258614483-0185dc8d6632`. A city skyline at dusk with lights. Used in acts 2, 3 and 6, and the lights overlay is placed over its lit areas.
- **Pylon:** https://unsplash.com/photos/pu848r_eCpI, served as `photo-1761735687594-00102de7fafd`. A tower silhouette against an orange dusk. Used in act 5.
- **Street:** https://unsplash.com/photos/WcAm09oFuzk, served as `photo-1731575381373-6168137c8054`. A street under sodium lamps, in portrait. Reserved for the story ad.
- Credit the photographers in the footer. All three are placeholders the owner can replace with their own city's photos.

## 9. Copy
- **Voice:** plain, calm, neighbourly. **Banned:** seamless, real-time-powered, revolutionize, game-changing, "AI".
- Every headline appears in section 5. No exclamation marks, and no trailing periods on headlines or buttons.
- **Claims needing the owner's proof:** "checked against official feeds" (the README says ingestion polls public feeds: keep this wording only if those feeds are on in production). All counts are demo, labeled "Example".

## 10. Acceptance criteria
1. The hero headline fits 2 lines at 1440 and at most 4 lines at 390, and the CTA is visible in the first viewport on both.
2. Sodium #FFB21A appears only in the city lights, the outage boundary and the primary button.
3. Act 3 is the longest scroll span, and the lights visibly switch off in clusters tied to scroll position.
4. The page background goes Dusk → Night in act 3 and back from Night → Dusk in act 6.
5. Every text/surface pair is at least 4.5:1, including the act 3 and act 5 text measured on the composited photo.
6. The 6 adopted 21st.dev components are present and restyled; none shows its demo look (no blue globe glow, no demo copy).
7. Reduced motion renders every act statically with no pinning, and nothing is invisible.
8. `/map` loads the existing map app unchanged in behavior; all links, the manifest and push deep links point to `/map`.
9. No horizontal scroll at 390. One h1. All numbers labeled "Example".
10. Lighthouse performance is at least 80 on desktop, with no console errors.

## 11. App (/map): one world with the landing (user requirement, 2026-11-04)
The user asked that the app and the landing feel like the same product. Someone who clicks "Open the live map" must land in the same night, the same lamps, the same type.
- **Same tokens, no second system.** Surfaces come from the night ramp (night, night-raised, night-high); text is lamp and lamp-soft; the one Action color is sodium (the report button, the selection, focus); horizon is the secondary accent, and violet is used only in the dusk mode. Everything comes from `@theme` in `app/globals.css`, with no new hex values in app components.
- **Same type.** Gloock for the few display moments (the outage title in the detail sheet, the empty state, big counts), Schibsted Grotesk for all UI. 400/500/600 only.
- **Same signature.** Outages glow like sodium streetlights on a dark basemap: clusters are soft sodium halos sized by report count, severity tints the halo (the card's severity tones), and resolved outages relight to a warm lamp dot. This is the landing's lights-canvas idea, living in the real map.
- **Same components.** The outage card in the list or sheet is the landing's `OutageCard` anatomy (service icon + label, severity dot + label, place in 600, detail, confirmations · action). The report flow matches the landing's phone screens (What's down? → three service tiles → "Report it" in sodium; confirm = "N neighbours see this too" + "I have it too"). If the app changes, update `components/landing/phone.tsx` so the landing never shows a different app.
- **Same depth and radius.** Dark mode depth from surface steps and lamp/10 hairlines, no shadows except sheets floating over the map. Radius: controls 12, cards 20, sheets 24, phone frame 40.
- **Same motion.** One easing (`--ease-lights`), 160-220ms for sheets and menus, and a short "lights out" pulse when a new outage appears. Reduced motion keeps every state, minus the movement.
- **Dusk light mode.** The landing's opening and closing palette (dusk ground, ink text, horizon accent, sodium Action) on a light basemap, so both modes are scenes from the landing.
- **Check before review.** Put the /map screenshots next to landing frames 11-16. A reviewer must not be able to tell where the landing ends and the app begins, apart from the map itself.
