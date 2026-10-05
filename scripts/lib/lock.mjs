// Dashboard lock: data.json is gzip-compressed and encrypted with a key derived from the
// dashboard password (GitHub secret DASHBOARD_PASSWORD). The browser decrypts it with the
// same password (src/services/dashLock.ts — keep both in step).
//
// File layout (data.enc):  "CWT1" | iterations (uint32 BE) | salt (16) | iv (12) | AES-GCM ciphertext+tag
import { webcrypto } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const { subtle } = webcrypto;
export const MAGIC = 'CWT1';
export const ITERATIONS = 310000;

/**
 * Fixed per-site salt, so a key remembered on a device keeps working across builds until the
 * password changes. SHA-256 of this text (same in the browser).
 */
export const SALT_TEXT = 'cartup-work-tracker|dashboard-lock|v1';

export async function saltBytes() {
  return new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(SALT_TEXT))).slice(0, 16);
}

export async function deriveKey(password, salt, iterations = ITERATIONS) {
  const base = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

/** JSON-able value → encrypted bytes. */
export async function encryptJson(value, password) {
  const salt = await saltBytes();
  const key = await deriveKey(password, salt);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const plain = gzipSync(Buffer.from(JSON.stringify(value)), { level: 9 });
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  const head = new Uint8Array(4 + 4 + 16 + 12);
  head.set(new TextEncoder().encode(MAGIC), 0);
  new DataView(head.buffer).setUint32(4, ITERATIONS);
  head.set(salt, 8);
  head.set(iv, 24);
  const out = new Uint8Array(head.length + ct.length);
  out.set(head, 0);
  out.set(ct, head.length);
  return out;
}

/** Apps Script access code for this password: hex SHA-256(raw AES key ‖ "|apps-script"). */
export async function scriptToken(password) {
  const key = await deriveKey(password, await saltBytes());
  const raw = new Uint8Array(await subtle.exportKey('raw', key));
  const tag = new TextEncoder().encode('|apps-script');
  const both = new Uint8Array(raw.length + tag.length);
  both.set(raw, 0);
  both.set(tag, raw.length);
  return Buffer.from(await subtle.digest('SHA-256', both)).toString('hex');
}
