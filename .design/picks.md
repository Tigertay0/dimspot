# Picks: Outage Tracker redesign (2026-11-04)

Chosen on the design-scout board (`.design/scout/board.html`, screenshot `board.png`): **Direction B, Lights Out**, with the direction's own component set. No swaps.

Scope: a scroll-experience landing page, a redesign of the map app, and ads.

## Direction
- **Idea:** a cinematic evening. The page begins at dusk, the lights go out as you scroll, and they come back on at the end.
- **Tell-someone sentence:** "It's the site where the city goes dark street by street as you scroll, then lights back up when you report it."
- **Theme:** mixed. Dusk light, then night, then the lights come back on.
- **Type:** a sharp editorial serif for display, a quiet grotesque for text (exact faces chosen from Fontesk in the brief).
- **What is new (ours alone):** the whole scroll is one evening. The page darkens as the outage spreads, and the lights come back on at the call to action, the "it's back" moment.

## Palette (starting point; the brief tunes and contrast-checks it)
| Name | Hex | Role |
|---|---|---|
| Dusk | #F4E9DC | ground (light sections, app light mode) |
| Night | #0C1222 | ground (night sections, app night mode) |
| Sodium | #FFB21A | brand: city lights, live clusters |
| Horizon | #E7A39A | brand: dusk sky, secondary highlights |
| Lamp white | #FFF6E5 | action color on night |

The existing severity scale (complete / degraded / intermittent / resolved) keeps its meaning. Sodium must not read as "intermittent" amber; the brief separates them.

## Motion idea
- **Signature:** zoom from a slowly turning globe down into a dusk city.
- **Scroll:** zoom parallax for the descent, then a sticky phone that swaps report → confirm → it's back.
- **Text:** vertical cut reveals on chapter headlines.
- **Interaction:** outage cards expand into a real map.
- **Ambient:** wave lines like power lines.

## Blend recipe (ingredients, never copies)
1. **godly: Set Space** (https://godly.design/website/set): a photographic dusk landscape with location points.
2. **godly: Solidroad** (https://godly.design/website/solidroad): a glowing line traced across terrain, here the outage boundary.
3. **godly: Arrakis** (https://godly.design/website/arrakis): a calm horizon arc for the night section.
4. **21st: Interactive Globe:** the opening orbit, with markers pulsing where outages are.
5. **21st: Zoom Parallax:** the descent from orbit into the street.

## How it carries across
- **Landing:** a scroll-craft experience from dusk to blackout to restored.
- **App:**
  - a night-first map with sodium-glow clusters
  - a dusk light mode
  - outage cards that expand into the map
- **Ads:** a vertical story ad: a street at dusk, lights going out, "Is it just you?"

## Components (21st.dev), to restyle past the demo look
| Code | Component | id | URL | Category | Motion layer | Use |
|---|---|---|---|---|---|---|
| B1 | Interactive Globe (dev.yadhakim) | 10073 | https://21st.dev/@dev.yadhakim/components/interactive-globe | Hero / globe | signature | opening orbit, outages as pulsing markers (canvas, zero deps) |
| B2 | Zoom Parallax (efferd) | 5967 | https://21st.dev/@efferd/components/zoom-parallax | Scroll | scroll | the descent |
| B3 | Scroll 01, sticky media (felipemenezes098) | 18041 | https://21st.dev/@felipemenezes098/components/scroll-01 | Scroll | scroll | sticky phone: report, confirm, it's back |
| B4 | Vertical Cut Reveal (cnippet-dev) | 18595 | https://21st.dev/@cnippet-dev/components/vertical-cut-reveal | Text animation | scroll | chapter headlines |
| B5 | Expanded Map card (dev.shejanmahamud) | 21985 | https://21st.dev/@dev.shejanmahamud/components/expanded-map | Interactive card | interaction | outage cards expand to a map |
| B6 | Wave Lines (balick) | 39083 | https://21st.dev/@balick/components/wave-lines | Background | ambient | power-line ambient background |

Shelf alternates, if a piece needs replacing: Globe with pulse markers (27474), Globe Hero 3D (5813), Worth Keeping CTA (26705), Footer with live stats ticket (33924), Bento grid 01 (9594), Text Reveal blur (23571).

## Sources not used this run
- Mobbin returned 403 to the automated browser, so nothing from it was used.
