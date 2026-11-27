# Dimspot design system (Lights Out)

Source: `.design/brief.md`. Tokens live in `app/globals.css` (`@theme`).

## Direction
- **Character:** hushed, cinematic, neighbourly.
- **World:** a city at dusk, sodium streetlights, power lines, the quiet of a blackout.
- **Theme:** mixed. Dusk light ↔ night, changing with the story on the landing page. The app gets night-first and dusk-light modes (app stage).

## Color tokens
| Token | Hex | Use |
|---|---|---|
| --color-dusk | #F4E9DC | light ground |
| --color-dusk-deep | #EADCCB | surfaces on dusk |
| --color-night | #0C1222 | dark ground |
| --color-night-raised | #151C30 | cards on night |
| --color-night-high | #1E2740 | raised controls on night |
| --color-ink | #161A26 | text on dusk |
| --color-ink-soft | #4A4F5E | secondary on dusk |
| --color-lamp | #FFF6E5 | text on night |
| --color-lamp-soft | #B9BBC6 | secondary on night |
| --color-horizon | #E7A39A | sky, arc |
| --color-violet | #6E5A8A | top of the sky gradient only |
| --color-sodium | #FFB21A | the city's lights, the outage boundary, the primary CTA, and the app's own primary action (the report button in /map and its mirror in the landing phone). Nothing else |
| --color-sodium-hover | #FFC24D | CTA hover |

Severity tokens (`--severity-*`) stay as they are, plus lightened night variants that hold 4.5:1 on Night.

## Type
- **Display (current):** Geist 600, tracking -0.04em, with Geist Mono for figures, chosen by the user on 2026-11-04 over Gloock and Schibsted (see brief section 3).
- **Display (original, retired):** Gloock 400. Fontesk https://fontesk.com/gloock-font/, OFL, web embedding allowed. Author Ernesto Vazquez (Google Fonts distribution).
- **Text:** Schibsted Grotesk 400/500/600. Fontesk https://fontesk.com/schibsted-grotesk-typeface/, OFL, web embedding allowed. Schibsted Media.
- **Scale:**
  - hero clamp(48px, 8vw, 112px) / 0.98 / -0.02em
  - H2 clamp(36px, 5.2vw, 76px) / 1.04
  - H3 24/1.2
  - lead 20/1.5
  - body 17/1.6
  - small 14/1.5

## Shape and depth
- **Radius:** controls 12, cards 20, phone 40 (screen 32).
- **Depth:** night uses surface steps plus 10% hairlines. Dusk uses `0 8px 24px rgba(22,26,38,0.08)`.
- **Text on photos:** a gradient scrim plus a progressive blur.

## Motion
- **Easing:** `cubic-bezier(0.16, 1, 0.3, 1)`.
- **Durations:** 150 / 200 / 400 / 600-800ms.
- **Motion system:**
  - Signature moment: the city's lights switch off street by street (landing act 3), and relight in act 6.
  - Scroll choreography: globe → zoom parallax → pinned lights-out → sticky phone → photo with cards → relight.
  - Interaction: draggable globe, tilting map cards, press-scale CTA.
  - Ambient: Wave Lines over the pylon sky (act 5) only.
- **Never animated:** map interactions in the app beyond MapLibre's own; keyboard actions.
- **Reduced motion:** a static frame per act, no pinning.

## Components (21st.dev)
| Component | Source URL | Changes made |
|---|---|---|
| Interactive Globe | https://21st.dev/@dev.yadhakim/components/interactive-globe | (filled in by the build) |
| Zoom Parallax | https://21st.dev/@efferd/components/zoom-parallax | |
| Scroll 01 | https://21st.dev/@felipemenezes098/components/scroll-01 | |
| Vertical Cut Reveal | https://21st.dev/@cnippet-dev/components/vertical-cut-reveal | |
| Expanded Map | https://21st.dev/@dev.shejanmahamud/components/expanded-map | |
| Wave Lines | https://21st.dev/@balick/components/wave-lines | |

## App (/map)
The app follows the Airbnb and Uber map screens the user chose as references (brief section 12), not Lights Out. Tokens live in `app/globals.css`.
- **Theme:** light by default (`dimspot-appearance` "dusk"); dark ("night") is the same system inverted.
- **Colour:** light: white surfaces, ink #1a1a1a, secondary #6a6a6a, hairline #ebebeb, primary #111111. Dark: #111111 / #1a1a1a / #242424, hairline #2a2a2a, ink #ededed, secondary #a1a1a1. Amber (`--brand`) is the mark only. Severity tokens are the only other colour.
- **Type:** Geist. Sheet titles 22 / 600; row titles 15 to 17 / 600; body 15; secondary 14. Figures use `tabular-nums`, not the mono face.
- **Shape:** pills for the search bar, markers, chips and the report button; `rounded-xl` (12) for buttons, inputs and tiles; `rounded-2xl` (16) for cards over the map; `rounded-3xl` (24) for sheets.
- **Depth:** the `panel` utility for anything over the map: solid card colour and `--shadow-float`, plus a hairline in the dark theme. No blur, no glow.
- **Header:** solid, with the pill search bar (filters and account buttons inside it) and `TypeTabs`, icon tabs with an underline for the selected one.
- **Markers:** white pills (`--shadow-marker`) with the service icon in the severity colour and a short figure: customers out, or confirmations. Selected is ink. Unconfirmed has a dashed edge. Clusters are a white disc with a thin severity-mix ring.
- **Marker to detail:** marker tap opens `OutagePreview` above the bottom sheet; the card or a list row opens the detail sheet.
- **Bottom sheet:** a handle and one centred line; tap to open the list.
- **Selection:** a 2px ink outline (tiles, severity rows, `Chip` tone `tint`); `Chip` tone `solid` fills with ink.
- **Touch targets:** every control sets its own size. A control drawn under 44px adds the `tap-target` utility, which grows the hit area with a pseudo-element and leaves layout alone. The blanket `min-height: 44px` rule applies to the landing pages only; in the app it stretched tabs, switches and checkboxes out of shape.
- **Sheets:** `max-h-[88dvh]` (dvh, not vh, so iOS toolbars do not cover the footer) and `pb-safe` for the home indicator. The report sheet is non-modal on its location step, so the map under it can be dragged.
- **Sizes:** buttons 48 / 36 (`sm`) / 56 (`lg`); inputs 48; chips 36; search bar 56; map controls 44.
- **Basemap:** OpenFreeMap recoloured per layer in `lib/map/brand-style.ts`. The heat map is drawn under the place names.
