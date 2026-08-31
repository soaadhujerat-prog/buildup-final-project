// =============================================================================
// BuildUp – Storage service (Phase 3B)
// =============================================================================
// Thin, UI-agnostic helpers over Supabase Storage. Every BuildUp bucket is
// PRIVATE (010_storage.sql); this module NEVER produces a public URL and never
// references a service-role key. Reads of private objects go through
// short-lived signed URLs; writes go into the caller's own {uid}/ folder,
// which the bucket policies already constrain.
//
// Local file bytes are read with `fetch(uri).arrayBuffer()` — the standard
// Expo/React Native pattern (no extra dependency; expo-file-system is not
// installed). The picked URIs come from expo-image-picker /
// expo-document-picker and are always `file://…` on device.
// =============================================================================

import { getSupabase } from './supabaseClient';

export type PrivateBucket =
  | 'avatars'
  | 'id-documents'
  | 'contractor-licenses'
  | 'worker-certificates'
  | 'worksite-images';

/** Signed-read TTLs (seconds). Documents get a short window (open-and-go);
 *  avatars a longer one so a session's avatar URL survives normal use. */
export const SIGNED_URL_TTL = {
  document: 120,
  avatar: 60 * 60 * 24,
} as const;

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/** Best-effort extension for a picked asset (mime first, then the uri tail). */
export const extForUpload = (mimeType?: string, uri?: string): string => {
  const m = (mimeType ?? '').toLowerCase();
  if (EXT_BY_MIME[m]) return EXT_BY_MIME[m];
  const tail = (uri ?? '').split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'heic', 'webp', 'pdf'].includes(tail)) {
    return tail === 'jpeg' ? 'jpg' : tail;
  }
  return 'jpg';
};

/** A concrete image/pdf mime for an upload — falls back to the file
 *  extension when the picker gave nothing usable ('image/*', undefined, …). */
export const mimeForUpload = (mimeType?: string, fileNameOrUri?: string): string => {
  const m = (mimeType ?? '').toLowerCase().trim();
  if (m && !m.includes('*') && m !== 'application/octet-stream') return m;
  return guessContentType(extForUpload(undefined, fileNameOrUri));
};

const guessContentType = (ext: string): string => {
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'heic':
      return 'image/heic';
    case 'webp':
      return 'image/webp';
    case 'pdf':
      return 'application/pdf';
    default:
      return 'image/jpeg';
  }
};

const randomStamp = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Read a local (file://) or remote asset into an ArrayBuffer. Throws a clear
 *  error the caller can surface as a real upload failure. */
async function readBytes(uri: string): Promise<{ bytes: ArrayBuffer; size: number }> {
  const res = await fetch(uri);
  if (!res.ok) throw new Error(`could not read the selected file (${res.status})`);
  const bytes = await res.arrayBuffer();
  if (!bytes || bytes.byteLength === 0) throw new Error('the selected file is empty');
  return { bytes, size: bytes.byteLength };
}

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

export interface OwnFolderUpload {
  path: string;
  /** e.g. 'avatar' | 'license' | 'certificate' — used only to build the name. */
  kind: string;
  mimeType?: string;
}

/**
 * Upload one local file into `${bucket}/${folder}/…`. `folder` is the first
 * path segment the bucket's RLS policy checks — the caller's uid for the
 * per-user buckets, or a job id for `worksite-images` (RLS: job_owner).
 * Returns the stored object PATH (never a URL) — that path is what belongs in
 * the DB.
 */
export async function uploadToFolder(
  bucket: PrivateBucket,
  folder: string,
  localUri: string,
  opts: { kind: string; mimeType?: string }
): Promise<string> {
  const ext = extForUpload(opts.mimeType, localUri);
  const contentType = guessContentType(ext);
  const { bytes } = await readBytes(localUri);
  const path = `${folder}/${opts.kind}-${randomStamp()}.${ext}`;

  const { error } = await getSupabase()
    .storage.from(bucket)
    .upload(path, bytes, { contentType, upsert: true });
  if (error) throw error;
  return path;
}

/** Upload into the caller's own `${bucket}/${uid}/…` folder (avatars, ID docs,
 *  certificates, licences). Thin wrapper over uploadToFolder. */
export async function uploadToOwnFolder(
  bucket: PrivateBucket,
  uid: string,
  localUri: string,
  opts: { kind: string; mimeType?: string }
): Promise<string> {
  return uploadToFolder(bucket, uid, localUri, opts);
}

/**
 * Upload the sign-up ID document with a one-shot signed token minted by the
 * `register-upload-url` Edge Function. No session and no service-role key are
 * involved — the token authorises exactly this one object.
 */
export async function uploadViaSignedUrl(
  bucket: PrivateBucket,
  path: string,
  token: string,
  localUri: string,
  mimeType?: string
): Promise<void> {
  const ext = extForUpload(mimeType, localUri);
  const contentType = guessContentType(ext);
  const { bytes } = await readBytes(localUri);
  const { error } = await getSupabase()
    .storage.from(bucket)
    .uploadToSignedUrl(path, token, bytes, { contentType });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Reads / cleanup
// ---------------------------------------------------------------------------

/** Mint a short-lived signed URL for one private object. Returns null on any
 *  failure so callers can fall back to an initials/placeholder rather than
 *  throw. */
export async function getSignedUrl(
  bucket: PrivateBucket,
  path: string | null | undefined,
  expiresIn: number = SIGNED_URL_TTL.document
): Promise<string | null> {
  if (!path) return null;
  try {
    const { data, error } = await getSupabase()
      .storage.from(bucket)
      .createSignedUrl(path, expiresIn);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

/** Best-effort delete of one storage object the caller is authorised to
 *  remove (own {uid}/ folder, or a job folder they own for worksite-images).
 *  Never throws — an orphaned private object is harmless. */
export async function removeObject(
  bucket: PrivateBucket,
  path: string | null | undefined
): Promise<void> {
  if (!path) return;
  try {
    await getSupabase().storage.from(bucket).remove([path]);
  } catch {
    /* ignore */
  }
}

/** @deprecated name — kept for existing Phase 3B call sites. Use removeObject. */
export const removeOwn = removeObject;

/** True when a string looks like a stored Storage path (uid/…) rather than a
 *  freshly-picked local file URI. */
export const isStoragePath = (v: string | null | undefined): boolean =>
  !!v && !/^(file|content|https?|data):/i.test(v) && v.includes('/');
