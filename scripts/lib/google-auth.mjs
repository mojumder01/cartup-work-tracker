// Service-account authentication for the Google Sheets API, using only Node's
// built-in crypto (no npm dependencies are installed in the data job).
//
// The credentials JSON is read from an environment variable that GitHub Actions
// fills from a repository secret. It is never written to disk or logged.
import { createSign } from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

export class DataSourceError extends Error {
  /**
   * @param {string} code  machine-readable category (AUTH, PERMISSION, NOT_FOUND, ...)
   * @param {string} message  friendly message that is safe to print in logs
   */
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * Accepts raw JSON, base64-encoded JSON, or JSON pasted without its outer
 * braces (a common copy/paste slip when updating the secret).
 */
export function normalizeKeyText(raw) {
  let text = raw.trim();
  if (!text.startsWith('{') && !text.startsWith('"')) {
    const decoded = Buffer.from(text, 'base64').toString('utf8').trim();
    if (decoded.startsWith('{')) return decoded;
  }
  if (!text.startsWith('{') && text.includes('"type"')) text = `{${text.replace(/,\s*$/, '')}`;
  if (text.startsWith('{') && !text.endsWith('}')) text = `${text.replace(/,\s*$/, '')}}`;
  return text;
}

/** Parses and validates the service-account JSON without echoing any of it. */
export function parseServiceAccount(raw) {
  if (!raw || !raw.trim()) {
    throw new DataSourceError(
      'AUTH',
      'GOOGLE_SERVICE_ACCOUNT_JSON is not set. Add the service-account key as a GitHub Actions secret.',
    );
  }
  let json;
  try {
    json = JSON.parse(normalizeKeyText(raw));
  } catch {
    throw new DataSourceError(
      'AUTH',
      'GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON. Paste the full contents of the key file into the secret.',
    );
  }
  if (json.type !== 'service_account' || !json.client_email || !json.private_key) {
    throw new DataSourceError(
      'AUTH',
      'GOOGLE_SERVICE_ACCOUNT_JSON does not look like a service-account key (type/client_email/private_key missing).',
    );
  }
  return { clientEmail: json.client_email, privateKey: json.private_key };
}

const base64url = (input) =>
  Buffer.from(typeof input === 'string' ? input : JSON.stringify(input)).toString('base64url');

/** Builds the signed JWT assertion for the OAuth 2.0 JWT-bearer grant. */
export function buildAssertion({ clientEmail, privateKey }, nowSeconds = Math.floor(Date.now() / 1000)) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: clientEmail,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  };
  const unsigned = `${base64url(header)}.${base64url(claims)}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  let signature;
  try {
    signature = signer.sign(privateKey).toString('base64url');
  } catch {
    throw new DataSourceError('AUTH', 'The service-account private key could not be used to sign a token.');
  }
  return `${unsigned}.${signature}`;
}

/** Exchanges the service-account credentials for a short-lived access token. */
export async function getAccessToken(serviceAccount) {
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: buildAssertion(serviceAccount),
  });
  let res;
  try {
    res = await fetch(TOKEN_URL, { method: 'POST', body });
  } catch {
    throw new DataSourceError('NETWORK', 'Network error while contacting Google authentication servers.');
  }
  if (!res.ok) {
    throw new DataSourceError(
      'AUTH',
      `Google rejected the service-account credentials (HTTP ${res.status}). Check that the key is active and not deleted.`,
    );
  }
  const json = await res.json();
  return json.access_token;
}
