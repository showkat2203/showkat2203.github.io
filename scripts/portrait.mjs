/**
 * Rebuilds the hero portrait from assets/portrait-source.png.
 *
 *   npm run portrait
 *
 * The photograph is used as shot, background included, so this only crops to a
 * square on the subject and emits the sizes the hero's srcset asks for. Both
 * themes show the same image, so nothing here is theme-dependent.
 */
import sharp from 'sharp';

const SRC = 'assets/portrait-source.png';

const { width, height } = await sharp(SRC).metadata();
const size = Math.min(width, height);
const square = () =>
  sharp(SRC).extract({
    left: Math.round((width - size) / 2),
    top: 0,
    width: size,
    height: size,
  });

for (const w of [1200, 800, 480]) {
  await square()
    .resize(w, w, { fit: 'cover' })
    .webp({ quality: 82, effort: 6 })
    .toFile(`public/img/portrait-${w}.webp`);
}

// Fallback for the few clients without webp.
await square()
  .resize(800, 800, { fit: 'cover' })
  .jpeg({ quality: 82, mozjpeg: true })
  .toFile('public/img/portrait-800.jpg');

console.log('wrote public/img/portrait-{1200,800,480}.webp and portrait-800.jpg');
