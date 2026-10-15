import sharp, { type Metadata } from 'sharp';

/**
 * Turns whatever a phone camera produced into two small WebP images.
 *
 * The browser already shrinks the photo before upload, but the server does
 * not rely on that: anything can arrive at an endpoint. Every image is decoded
 * and re-encoded here, which also strips EXIF, so a product photo never
 * carries the GPS position of the shop that took it.
 *
 *   full   up to 800px on the long side, for the product view
 *   thumb  up to 320px, for the store grid, which is what most visitors load
 *
 * At these settings a typical product photo comes out at 30 to 70KB full and
 * 8 to 15KB thumb.
 */

const FULL_PX = 800;
const THUMB_PX = 320;
/** A decompression bomb guard: refuse anything claiming more pixels than this. */
const MAX_INPUT_PIXELS = 40_000_000;

export interface Encoded { full: Buffer; thumb: Buffer; width: number; height: number }

export class ImageError extends Error {}

export async function encodeProductImage(input: Buffer): Promise<Encoded> {
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    throw new ImageError('That file is not a picture we can read. Use a JPG, PNG or WebP photo.');
  }
  if (!meta.format || !['jpeg', 'png', 'webp', 'heif', 'avif', 'gif'].includes(meta.format)) {
    throw new ImageError('Use a JPG, PNG or WebP photo.');
  }

  const base = () => sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, animated: false })
    .rotate()                       // honour the camera's orientation, then drop it
    .flatten({ background: '#ffffff' });   // transparent PNGs onto white, not black

  const { data: full, info } = await base()
    .resize({ width: FULL_PX, height: FULL_PX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 72, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  const thumb = await base()
    .resize({ width: THUMB_PX, height: THUMB_PX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 62, effort: 4 })
    .toBuffer();

  return { full, thumb, width: info.width, height: info.height };
}
