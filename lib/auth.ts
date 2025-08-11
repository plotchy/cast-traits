// Auth token signing and verification for both Node and Edge runtimes

const VERSION = 'v1';

function base64UrlEncode(bytes: Uint8Array): string {
  const bin = typeof Buffer !== 'undefined' ? Buffer.from(bytes).toString('base64') : btoa(String.fromCharCode(...bytes));
  return bin.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binStr = atob(b64);
  const out = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) out[i] = binStr.charCodeAt(i);
  return out;
}

function textEncoder() {
  return new TextEncoder();
}

async function hmacSha256(keyBytes: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  // Prefer Web Crypto subtle if available
  const maybeCrypto: unknown = (globalThis as unknown as { crypto?: Crypto }).crypto;
  if (maybeCrypto && (maybeCrypto as Crypto).subtle) {
    const subtle = (maybeCrypto as Crypto).subtle;
    const keyAb = new ArrayBuffer(keyBytes.byteLength);
    new Uint8Array(keyAb).set(keyBytes);
    const dataAb = new ArrayBuffer(data.byteLength);
    new Uint8Array(dataAb).set(data);
    const cryptoKey = await subtle.importKey('raw', keyAb, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await subtle.sign('HMAC', cryptoKey, dataAb);
    return new Uint8Array(sig);
  }
  // Node fallback using WebCrypto API (Node 18+)
  const nodeSubtle: SubtleCrypto | undefined = (globalThis as unknown as { crypto?: Crypto }).crypto?.subtle;
  if (nodeSubtle) {
    const keyAb = new ArrayBuffer(keyBytes.byteLength);
    new Uint8Array(keyAb).set(keyBytes);
    const dataAb = new ArrayBuffer(data.byteLength);
    new Uint8Array(dataAb).set(data);
    const cryptoKey = await nodeSubtle.importKey('raw', keyAb, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await nodeSubtle.sign('HMAC', cryptoKey, dataAb);
    return new Uint8Array(sig);
  }
  throw new Error('No WebCrypto available for HMAC');
}

function getSecretBytes(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET must be set');
  return textEncoder().encode(secret);
}

export type AuthPayload = {
  iat: number; // issued at unix seconds
  exp: number; // expiry unix seconds
};

export async function signAuthToken(ttlSeconds = 60 * 60 * 24 * 365): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const payload: AuthPayload = { iat: nowSec, exp: nowSec + ttlSeconds };
  const payloadStr = JSON.stringify(payload);
  const payloadB64 = base64UrlEncode(textEncoder().encode(payloadStr));
  const toSign = `${VERSION}.${payloadB64}`;
  const sig = await hmacSha256(getSecretBytes(), textEncoder().encode(toSign));
  const sigB64 = base64UrlEncode(sig);
  return `${toSign}.${sigB64}`;
}

export async function verifyAuthToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [ver, payloadB64, sigB64] = parts;
  if (ver !== VERSION) return false;
  const toSign = `${ver}.${payloadB64}`;
  const expectedSig = await hmacSha256(getSecretBytes(), textEncoder().encode(toSign));
  const providedSig = base64UrlDecode(sigB64);
  if (expectedSig.length !== providedSig.length) return false;
  // Constant-time compare
  let ok = 0;
  for (let i = 0; i < expectedSig.length; i++) ok |= expectedSig[i] ^ providedSig[i];
  if (ok !== 0) return false;
  try {
    const payloadJson = new TextDecoder().decode(base64UrlDecode(payloadB64));
    const payload = JSON.parse(payloadJson) as AuthPayload;
    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || nowSec >= payload.exp) return false;
    return true;
  } catch {
    return false;
  }
}


