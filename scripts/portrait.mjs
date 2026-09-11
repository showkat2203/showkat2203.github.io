/**
 * Rebuilds the hero portrait from assets/portrait-source.png.
 *
 *   npm run portrait
 *
 * The background is removed rather than replaced with a fixed colour, so the
 * backdrop can come from a theme token and stay right in both light and dark.
 * The jpeg is a flattened fallback for the handful of clients without webp
 * alpha; it bakes in the light-mode tint.
 *
 * The `medium` model is not optional: `small` leaves sky and shingle in the
 * mask and punches holes in a dark jacket.
 */
import { removeBackground } from '@imgly/background-removal-node';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

const SRC = 'assets/portrait-source.png';
const TINT = '#f2efe9';

const blob = new Blob([await readFile(SRC)], { type: 'image/png' });
const cut = await removeBackground(blob, { model: 'medium', output: { format: 'image/png' } });
const cutBuf = Buffer.from(await cut.arrayBuffer());

const { width, height } = await sharp(cutBuf).metadata();
const size = Math.min(width, height);
const square = () =>
  sharp(cutBuf).extract({
    left: Math.round((width - size) / 2),
    top: 0,
    width: size,
    height: size,
  });

for (const w of [1200, 800, 480]) {
  await square()
    .resize(w, w, { fit: 'cover' })
    .webp({ quality: 82, alphaQuality: 90, effort: 6 })
    .toFile(`public/img/portrait-${w}.webp`);
}

const flat = await square().resize(800, 800, { fit: 'cover' }).png().toBuffer();
await sharp({ create: { width: 800, height: 800, channels: 4, background: TINT } })
  .composite([{ input: flat }])
  .jpeg({ quality: 84, mozjpeg: true })
  .toFile('public/img/portrait-800.jpg');

console.log('wrote public/img/portrait-{1200,800,480}.webp and portrait-800.jpg');
