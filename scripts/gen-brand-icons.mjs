/**
 * Renders every app icon from the master logo, public/brand/dimspot-mark.svg:
 * the PWA icons, the Apple touch icon, the notification badge and the favicon.
 * Run it again whenever the logo changes:  node scripts/gen-brand-icons.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const MASTER = "public/brand/dimspot-mark.svg";
const GROUND = "#fff6e5"; // lamp white, the ground the logo was approved on
const APP_ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const FAVICON_SIZES = [16, 32, 48, 256];
/** Share of the icon's height the mark fills. App icons stay inside the maskable safe zone. */
const APP_MARK_HEIGHT = 0.6;
const FAVICON_MARK_HEIGHT = 0.8;
const FAVICON_CORNER = 0.2;
const RENDER_SIZE = 1024;

const master = await readFile(MASTER, "utf8");
const viewBox = master.match(/viewBox="([^"]+)"/)?.[1];
const shapes = [...master.matchAll(/<path[^>]*\/>/g)].map((m) => m[0]);
if (!viewBox || shapes.length !== 2) throw new Error(`${MASTER} is not the two-shape logo this script expects`);
const [, , markWidth, markHeight] = viewBox.split(" ").map(Number);

/** The logo centred on a square, as an SVG string. */
function square({ markShare, ground, corner = 0, paths = shapes }) {
  const height = RENDER_SIZE * markShare;
  const width = (height * markWidth) / markHeight;
  const x = (RENDER_SIZE - width) / 2;
  const y = (RENDER_SIZE - height) / 2;
  const background = ground
    ? `<rect width="${RENDER_SIZE}" height="${RENDER_SIZE}" rx="${RENDER_SIZE * corner}" fill="${ground}"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${RENDER_SIZE} ${RENDER_SIZE}">${background}<svg x="${x}" y="${y}" width="${width}" height="${height}" viewBox="${viewBox}">${paths.join("")}</svg></svg>`;
}

function png(svg, size) {
  return sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
}

/** An .ico file holding PNG images, which every current browser reads. */
function ico(images) {
  const HEADER = 6;
  const ENTRY = 16;
  const header = Buffer.alloc(HEADER);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = HEADER + ENTRY * images.length;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(ENTRY);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // 0 means 256
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map((image) => image.data)]);
}

const appIcon = square({ markShare: APP_MARK_HEIGHT, ground: GROUND });
for (const size of APP_ICON_SIZES) await writeFile(`public/icons/icon-${size}.png`, await png(appIcon, size));
await writeFile("public/apple-touch-icon.png", await png(appIcon, 180));

// Android shows only the badge's shape, in its own colour, so both parts are drawn white on clear.
const white = shapes.map((shape) => shape.replace(/fill="[^"]+"/, 'fill="#ffffff"'));
await writeFile("public/icons/badge-72.png", await png(square({ markShare: FAVICON_MARK_HEIGHT, paths: white }), 72));

const favicon = square({ markShare: FAVICON_MARK_HEIGHT, ground: GROUND, corner: FAVICON_CORNER });
const faviconImages = await Promise.all(FAVICON_SIZES.map(async (size) => ({ size, data: await png(favicon, size) })));
await writeFile("app/favicon.ico", ico(faviconImages));

console.info(`Wrote ${APP_ICON_SIZES.length + 2} PNG icons and app/favicon.ico from ${MASTER}`);
