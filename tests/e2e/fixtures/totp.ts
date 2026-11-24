import { createHmac } from 'node:crypto';

/** RFC 6238 TOTP (SHA-1, 30 s, 6 digits) with node:crypto only. */
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(secret: string): Buffer {
  const clean = secret.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error('Invalid base32 secret');
    value = ((value << 5) | index) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function totp(secret: string, timeMs = Date.now(), stepSeconds = 30, digits = 6): string {
  const counter = Math.floor(timeMs / 1000 / stepSeconds);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32Decode(secret)).update(buffer).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return code.toString().padStart(digits, '0');
}

/** A code that stays valid for at least `marginMs` (waits for the next window if needed). */
export async function freshTotp(secret: string, marginMs = 3_000): Promise<string> {
  const remaining = 30_000 - (Date.now() % 30_000);
  if (remaining < marginMs) await new Promise((resolve) => setTimeout(resolve, remaining + 50));
  return totp(secret);
}
