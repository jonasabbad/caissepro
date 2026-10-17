import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { badRequest } from './errors.js';

/** Uploaded files live outside the database, under server/uploads/<tenantId>/, and are served at /uploads/. */
export const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads');
export const UPLOAD_PREFIX = '/uploads/';
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const TYPES: Record<string, { ext: string; magic: (b: Buffer) => boolean }> = {
  'image/webp': { ext: 'webp', magic: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
  'image/jpeg': { ext: 'jpg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: 'png', magic: (b) => b.subarray(1, 4).toString('ascii') === 'PNG' },
};
const PDF = { ext: 'pdf', magic: (b: Buffer) => b.subarray(0, 5).toString('ascii') === '%PDF-' };
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Decodes a `data:image/...;base64,` URL, checks its type against the file signature and stores it for the tenant. */
export async function saveImage(tenantId: string, dataUrl: string): Promise<string> {
  const m = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  const type = m && TYPES[m[1]];
  if (!m || !type) throw badRequest('Format d’image non pris en charge (WebP, JPEG ou PNG)');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX_IMAGE_BYTES) throw badRequest('Image trop volumineuse (2 Mo maximum)');
  if (!type.magic(buf)) throw badRequest('Fichier image invalide');
  const dir = path.join(UPLOAD_DIR, tenantId);
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.${type.ext}`;
  await writeFile(path.join(dir, name), buf);
  return `${UPLOAD_PREFIX}${tenantId}/${name}`;
}

/** Stores an expense receipt: an image (already resized by the browser) or a PDF, up to 5 MB. */
export async function saveAttachment(tenantId: string, dataUrl: string): Promise<string> {
  if (dataUrl.startsWith('data:image/')) return saveImage(tenantId, dataUrl);
  const m = /^data:application\/pdf;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw badRequest('Format de fichier non pris en charge (image ou PDF)');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > MAX_FILE_BYTES) throw badRequest('Fichier trop volumineux (5 Mo maximum)');
  if (!PDF.magic(buf)) throw badRequest('Fichier PDF invalide');
  const dir = path.join(UPLOAD_DIR, tenantId);
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.pdf`;
  await writeFile(path.join(dir, name), buf);
  return `${UPLOAD_PREFIX}${tenantId}/${name}`;
}

/** A file this tenant uploaded, with one of the given extensions. */
export const isOwnUpload = (tenantId: string, url: string, exts: string[]) =>
  new RegExp(`^${UPLOAD_PREFIX}${tenantId}/[0-9a-f-]+\\.(${exts.join('|')})$`).test(url);

/** Removes a file this tenant uploaded; anything else (external URLs, other tenants' files) is left alone. */
export async function removeUpload(tenantId: string, url: string | null | undefined) {
  if (!url?.startsWith(`${UPLOAD_PREFIX}${tenantId}/`)) return;
  const name = path.basename(url);
  await unlink(path.join(UPLOAD_DIR, tenantId, name)).catch(() => undefined);
}

/** An image URL a product may point to: one of the tenant's own uploads, or an external https image. */
export function isAllowedImageUrl(tenantId: string, url: string) {
  return /^https:\/\/\S+$/.test(url) || new RegExp(`^${UPLOAD_PREFIX}${tenantId}/[0-9a-f-]+\\.(webp|jpg|png)$`).test(url);
}
