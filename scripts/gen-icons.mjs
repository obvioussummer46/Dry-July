// Generate PWA PNG icons from the app logo using sharp.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "icons");
await mkdir(outDir, { recursive: true });

const drop = (scale = 1) => `
  <path d="M32 12 C 32 12, 46 30, 46 40 a14 14 0 0 1 -28 0 C 18 30, 32 12, 32 12 Z"
        fill="url(#g)" transform="scale(${scale})"/>
  <line x1="18" y1="18" x2="46" y2="46" stroke="#0b1020" stroke-width="5" stroke-linecap="round" transform="scale(${scale})"/>
  <line x1="18" y1="18" x2="46" y2="46" stroke="#fb7185" stroke-width="3" stroke-linecap="round" transform="scale(${scale})"/>
`;

const svg = (maskable = false) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#5ef295"/>
      <stop offset="1" stop-color="#38bdf8"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="${maskable ? 0 : 14}" fill="#0b1020"/>
  <g transform="${maskable ? "translate(8 8) scale(0.75)" : ""}">${drop()}</g>
</svg>`;

const jobs = [
  { name: "icon-192.png", size: 192, maskable: false },
  { name: "icon-512.png", size: 512, maskable: false },
  { name: "icon-maskable-512.png", size: 512, maskable: true },
  { name: "apple-touch-icon.png", size: 180, maskable: false }
];

for (const job of jobs) {
  await sharp(Buffer.from(svg(job.maskable)))
    .resize(job.size, job.size)
    .png()
    .toFile(join(outDir, job.name));
  console.log("wrote", job.name);
}
console.log("Icons generated in", outDir);
