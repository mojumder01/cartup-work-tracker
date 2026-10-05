// Locks the dashboard data before the site is built: when the GitHub secret DASHBOARD_PASSWORD is
// set, public/data/data.json is replaced by the encrypted public/data/data.enc (see scripts/lib/lock.mjs).
// Without the secret nothing changes and the dashboard stays open.
import { readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encryptJson } from './lib/lock.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const input = resolve(root, 'public/data/data.json');
const output = resolve(root, 'public/data/data.enc');
const password = process.env.DASHBOARD_PASSWORD ?? '';

if (!password) {
  console.log('::notice::DASHBOARD_PASSWORD is not set — the dashboard is published without a password.');
  await rm(output, { force: true });
} else {
  if (password.length < 8) throw new Error('DASHBOARD_PASSWORD must be at least 8 characters.');
  const data = JSON.parse(await readFile(input, 'utf8'));
  const bytes = await encryptJson(data, password);
  await writeFile(output, bytes);
  await rm(input); // the plain file must not be published
  console.log(`Dashboard data locked: data.enc ${(bytes.length / 1e6).toFixed(2)} MB (plain data.json removed).`);
}
