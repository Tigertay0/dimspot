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
The app follows the homepage's minimal system, not Lights Out (brief section 12). Tokens live in `app/globals.css`.
- **Colour:** dark #111111 / #1a1a1a / #242424 with a #2a2a2a hairline, ink #ededed, secondary #a1a1a1. Light #fafafa / #ffffff / #f2f2f2 with a #e6e6e6 hairline, ink #171717, secondary #666666. The primary action is ink. Amber (`--brand`) is the mark and the report pin only. Severity tokens are the only other colour.
- **Type:** Geist 14 / 13 / 12; 500 for emphasis, 600 for sheet titles. Geist Mono (`font-mono`) for every figure.
- **Shape:** 6 chips and badges, 8 buttons, inputs and tiles, 12 search bar and dock, 16 sheets. No pills except dots and the switch.
- **Depth:** the `panel` utility for anything over the map: solid card colour, hairline, `--shadow-float`. No blur, no glow. Hairlines separate inside sheets.
- **Touch targets:** every control sets its own size. A control drawn under 44px adds the `tap-target` utility, which grows the hit area with a pseudo-element and leaves layout alone. The blanket `min-height: 44px` rule applies to the landing pages only; in the app it stretched tabs, switches and checkboxes out of shape.
- **Sheets:** `max-h-[88dvh]` (dvh, not vh, so iOS toolbars do not cover the footer) and `pb-safe` for the home indicator.
- **Selection:** `Chip` tone `solid` fills with ink (over the map); tone `tint` is an ink outline on the secondary fill (in sheets, beside an ink primary button).
- **Sizes:** buttons 40 / 32 (`sm`) / 44 (`lg`); inputs 40; chips 32; badges 22; text tabs 40; map controls 40.
- **Basemap:** OpenFreeMap recoloured per layer in `lib/map/brand-style.ts`, neutral greys in both themes.
- **Markers:** flat 24px discs, service icon 12px, 2px ring in the page colour; hollow when unconfirmed. Clusters are a severity-mix ring around a mono count. A faint blurred circle under each marker scales with customers affected.
