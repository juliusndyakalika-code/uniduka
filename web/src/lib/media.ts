import { API_BASE } from '../config';

/**
 * Product pictures: where they are served from, and shrinking them before
 * upload.
 *
 * Uploaded images live behind the API (/public/images/<id>), which in
 * production is a different host from the web app, so the stored path is
 * joined to the API base here. Anything else (an old absolute URL) is used
 * as it is.
 */
export function mediaUrl(url: string | null | undefined, size: 'thumb' | 'full' = 'full'): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('/public/images/')) return `${API_BASE}${url}${size === 'thumb' ? '?s=thumb' : ''}`;
  return url;
}

/**
 * A phone photo, shrunk in the browser before it is sent.
 *
 * A 12MP camera image is 3 to 6MB; at 1200px it is a tenth of that, which
 * matters on a mobile connection. The server re-encodes it again to its own
 * sizes, so this step is about upload time, not the final result. WebP where
 * the browser can write it, JPEG otherwise.
 */
export async function shrinkPhoto(file: File, max = 1200): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fail(new Error('That file is not a picture.'));
      i.src = url;
    });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';            // transparent PNGs onto white
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const webp = c.toDataURL('image/webp', 0.82);
    return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}
