import * as Crypto from 'expo-crypto';

// ethers 生成助记词/私钥依赖 crypto.getRandomValues，使用系统安全随机数实现
const g = globalThis as any;
if (!g.crypto) g.crypto = {};
if (typeof g.crypto.getRandomValues !== 'function') {
  g.crypto.getRandomValues = <T extends ArrayBufferView | null>(array: T): T =>
    Crypto.getRandomValues(array as any) as T;
}
