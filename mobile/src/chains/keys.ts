import { mnemonicToSeedSync } from '@scure/bip39';
import { HDKey } from '@scure/bip32';
import * as btc from '@scure/btc-signer';
import { hex } from '@scure/base';
import { hmac } from '@noble/hashes/hmac.js';
import { sha512 } from '@noble/hashes/sha2.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bs58, tronAddressFromPublicKey } from './encoding';
import type { ChainAccount, ChainAccounts } from './types';

// 派生路径与主流钱包一致：同一助记词在 MetaMask / Phantom / TronLink 中得到相同地址
export const PATHS = {
  bitcoin: "m/84'/0'/0'/0/0", // BIP84 原生隔离见证 (bc1…)
  bitcoinTestnet: "m/84'/1'/0'/0/0", // tb1…
  solana: "m/44'/501'/0'/0'", // SLIP-0010 ed25519 (Phantom 默认)
  tron: "m/44'/195'/0'/0/0", // BIP44 coin type 195
};

function deriveSecp(seed: Uint8Array, path: string): Uint8Array {
  const key = HDKey.fromMasterSeed(seed).derive(path).privateKey;
  if (!key) throw new Error(`Failed to derive ${path}`);
  return key;
}

function bitcoinAccount(seed: Uint8Array, path: string, network: typeof btc.NETWORK): ChainAccount {
  const privateKey = deriveSecp(seed, path);
  const address = btc.p2wpkh(secp256k1.getPublicKey(privateKey, true), network).address!;
  return { address, privateKey: hex.encode(privateKey) };
}

/** SLIP-0010 ed25519 派生 (仅支持硬化路径) */
function deriveEd25519(seed: Uint8Array, path: string): Uint8Array {
  let I = hmac(sha512, new TextEncoder().encode('ed25519 seed'), seed);
  let key = I.slice(0, 32);
  let chainCode = I.slice(32);
  for (const segment of path.split('/').slice(1)) {
    if (!segment.endsWith("'")) throw new Error('ed25519 only supports hardened derivation');
    const index = (parseInt(segment, 10) + 0x80000000) >>> 0;
    const data = new Uint8Array(37);
    data.set(key, 1);
    new DataView(data.buffer).setUint32(33, index);
    I = hmac(sha512, chainCode, data);
    key = I.slice(0, 32);
    chainCode = I.slice(32);
  }
  return key;
}

export function solanaAccountFromSeed(privateKey: Uint8Array): ChainAccount {
  return { address: bs58.encode(ed25519.getPublicKey(privateKey)), privateKey: hex.encode(privateKey) };
}

export function deriveChainAccounts(mnemonic: string): ChainAccounts {
  const seed = mnemonicToSeedSync(mnemonic.trim());
  const tronKey = deriveSecp(seed, PATHS.tron);
  return {
    bitcoin: bitcoinAccount(seed, PATHS.bitcoin, btc.NETWORK),
    bitcoinTestnet: bitcoinAccount(seed, PATHS.bitcoinTestnet, btc.TEST_NETWORK),
    solana: solanaAccountFromSeed(deriveEd25519(seed, PATHS.solana)),
    tron: {
      address: tronAddressFromPublicKey(secp256k1.getPublicKey(tronKey, false)),
      privateKey: hex.encode(tronKey),
    },
  };
}
