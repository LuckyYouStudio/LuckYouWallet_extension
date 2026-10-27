import { base58, createBase58check, hex } from '@scure/base';
import { sha256 } from '@noble/hashes/sha2.js';
import { keccak_256 } from '@noble/hashes/sha3.js';

export const bs58 = base58;
const bs58check = createBase58check(sha256);

/** Tron 地址 = base58check(0x41 + keccak256(未压缩公钥)[12:]) */
export function tronAddressFromPublicKey(uncompressed: Uint8Array): string {
  const hash = keccak_256(uncompressed.slice(1));
  const bytes = new Uint8Array(21);
  bytes[0] = 0x41;
  bytes.set(hash.slice(12), 1);
  return bs58check.encode(bytes);
}

/** Tron base58 地址 → 21 字节 hex (41 开头) */
export function tronToHex(address: string): string {
  const bytes = bs58check.decode(address);
  if (bytes.length !== 21 || bytes[0] !== 0x41) throw new Error('Invalid Tron address');
  return hex.encode(bytes);
}

/** 21 字节 hex (41 开头) → Tron base58 地址 */
export function tronFromHex(value: string): string {
  return bs58check.encode(hex.decode(value.replace(/^0x/, '')));
}

export function isTronAddress(address: string): boolean {
  try {
    tronToHex(address);
    return true;
  } catch {
    return false;
  }
}

/** 十进制金额字符串 → 最小单位整数，避免浮点误差 */
export function parseUnits(amount: string, decimals: number): bigint {
  const [whole, frac = ''] = amount.trim().split('.');
  if (!/^\d*$/.test(whole) || !/^\d*$/.test(frac) || (whole === '' && frac === '')) throw new Error('Invalid amount');
  if (frac.length > decimals) throw new Error(`Too many decimals (max ${decimals})`);
  return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0') || '0');
}

export function formatUnits(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}
