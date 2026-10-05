/**
 * Dashboard lock (browser side of scripts/lib/lock.mjs — keep both in step).
 * When the build publishes data/data.enc instead of data.json, the dashboard asks for the
 * password, derives the AES key, and can remember that key (never the password) on the device.
 */
const MAGIC = 'CWT1';
const SALT_TEXT = 'cartup-work-tracker|dashboard-lock|v1';
const STORE = 'cartup.dashKey';

let current: CryptoKey | null = null;
let token: string | null = null;

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function stored(): string | null {
  try {
    return sessionStorage.getItem(STORE) ?? localStorage.getItem(STORE);
  } catch {
    return null;
  }
}

async function saltBytes(): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(SALT_TEXT))).slice(0, 16);
}

async function deriveRaw(password: string, iterations: number, salt: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 256));
}

async function useRaw(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  const tag = new TextEncoder().encode('|apps-script');
  const both = new Uint8Array(raw.length + tag.length);
  both.set(raw, 0);
  both.set(tag, raw.length);
  token = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', both)), (x) => x.toString(16).padStart(2, '0')).join('');
  current = key;
  return key;
}

/** Is this a locked data file? */
export const isLockedFile = (buf: ArrayBuffer) => buf.byteLength > 36 && new TextDecoder().decode(new Uint8Array(buf, 0, 4)) === MAGIC;

async function decryptWith(buf: ArrayBuffer, key: CryptoKey): Promise<unknown> {
  const bytes = new Uint8Array(buf);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(24, 36) }, key, bytes.slice(36));
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser is too old to open the locked dashboard. Please update Chrome / Edge / Safari.');
  const text = await new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  return JSON.parse(text);
}

/** Decrypt with the key already in memory or remembered on this device; null when there is none or it no longer fits. */
export async function openWithSaved(buf: ArrayBuffer): Promise<unknown | null> {
  try {
    if (!current) {
      const s = stored();
      if (!s) return null;
      await useRaw(unb64(s));
    }
    return await decryptWith(buf, current!);
  } catch (e) {
    if ((e as Error).message.includes('too old')) throw e;
    lockDashboard(); // password changed since → ask again
    return null;
  }
}

/** Try a password; on success the key is kept (and remembered on this device when asked). */
export async function openWithPassword(buf: ArrayBuffer, password: string, remember: boolean): Promise<unknown> {
  const iter = new DataView(buf).getUint32(4);
  const raw = await deriveRaw(password, iter, await saltBytes());
  const key = await useRaw(raw);
  let value: unknown;
  try {
    value = await decryptWith(buf, key);
  } catch (e) {
    current = null;
    token = null;
    if ((e as Error).message.includes('too old')) throw e;
    throw new Error('Wrong password.');
  }
  try {
    (remember ? localStorage : sessionStorage).setItem(STORE, b64(raw));
  } catch {
    /* private window: works for this visit only */
  }
  return value;
}

/** Decrypt a fresh copy of the data (auto-refresh). Throws when the key no longer fits. */
export async function decryptCurrent(buf: ArrayBuffer): Promise<unknown> {
  const v = await openWithSaved(buf);
  if (v === null) throw new Error('locked');
  return v;
}

/** Forget the key on this device. */
export function lockDashboard() {
  current = null;
  token = null;
  try {
    localStorage.removeItem(STORE);
    sessionStorage.removeItem(STORE);
  } catch {
    /* ignore */
  }
}

/** Apps Script access code for the unlocked dashboard (null when not locked / not unlocked). */
export const dashToken = () => token;
export const isUnlocked = () => !!current;
