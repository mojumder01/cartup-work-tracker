import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { encryptJson, deriveKey, saltBytes, MAGIC } from './lib/lock.mjs';

// Decrypts the way the browser does (src/services/dashLock.ts).
async function decrypt(bytes, password) {
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), MAGIC);
  const iter = new DataView(bytes.buffer, bytes.byteOffset).getUint32(4);
  const key = await deriveKey(password, bytes.slice(8, 24), iter);
  const plain = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(24, 36) }, key, bytes.slice(36));
  return JSON.parse(gunzipSync(Buffer.from(plain)).toString('utf8'));
}

test('dashboard data round-trips with the right password only', async () => {
  const value = { work: { columns: ['JOB ID'], rows: [['CCWT1']] }, updatedAt: 'x' };
  const bytes = await encryptJson(value, 'correct horse');
  assert.deepEqual(await decrypt(bytes, 'correct horse'), value);
  await assert.rejects(decrypt(bytes, 'wrong password'));
  assert.deepEqual(bytes.slice(8, 24), await saltBytes());
  assert.ok(!Buffer.from(bytes).toString('latin1').includes('CCWT1'));
});
