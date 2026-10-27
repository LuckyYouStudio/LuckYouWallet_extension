import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Crypto from 'expo-crypto';
import { pbkdf2, hexlify, toUtf8Bytes } from 'ethers';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { kv } from './storage';
import type { ChainAccounts } from '@/chains';

/**
 * 密钥保险库：钱包密钥只存放在 iOS Keychain 中 (仅本机、设备解锁时可访问，不随 iCloud 备份迁移)。
 * 应用密码以 PBKDF2-SHA256 加盐哈希保存，用于解锁界面校验。
 * 密钥本身由 Keychain 保护，密码只是界面门禁，因此迭代次数取 1 万次以兼顾纯 JS 计算的响应速度。
 */
export interface WalletSecret {
  address: string;
  privateKey: string;
  mnemonic?: string;
  /** 由助记词派生的比特币 / Solana / Tron 账户 (私钥导入的钱包没有) */
  chains?: ChainAccounts;
}

const SECRET_KEY = 'luckyou.wallet';
const PASSWORD_KEY = 'luckyou.password';
const BIOMETRICS_KEY = 'luckyou.biometrics';
const INSTALLED_KEY = 'luckyou.installed';
const PBKDF2_ITERATIONS = 10_000;

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

interface PasswordRecord {
  salt: string;
  hash: string;
  iterations: number;
}

function hashPassword(password: string, salt: string, iterations: number): string {
  return pbkdf2(toUtf8Bytes(password), salt, iterations, 32, 'sha256');
}

/**
 * iOS 卸载 App 后 Keychain 可能残留，首次启动时清理旧数据。
 * 只有标记确实不存在才视为新安装；读取出错会抛出，绝不在不确定时清空钱包
 */
export async function ensureFreshInstall(): Promise<void> {
  const raw = await AsyncStorage.getItem(INSTALLED_KEY);
  if (raw === null) {
    await wipeSecrets();
    await kv.set(INSTALLED_KEY, true);
  }
}

export async function hasWallet(): Promise<boolean> {
  return (await SecureStore.getItemAsync(SECRET_KEY, OPTIONS)) != null;
}

export async function saveWallet(secret: WalletSecret, password: string): Promise<void> {
  const salt = hexlify(Crypto.getRandomBytes(16));
  const record: PasswordRecord = { salt, hash: hashPassword(password, salt, PBKDF2_ITERATIONS), iterations: PBKDF2_ITERATIONS };
  await SecureStore.setItemAsync(SECRET_KEY, JSON.stringify(secret), OPTIONS);
  await SecureStore.setItemAsync(PASSWORD_KEY, JSON.stringify(record), OPTIONS);
}

/** 更新密钥内容 (如为旧钱包补充多链账户)，不改变密码 */
export async function updateSecret(secret: WalletSecret): Promise<void> {
  await SecureStore.setItemAsync(SECRET_KEY, JSON.stringify(secret), OPTIONS);
}

export async function verifyPassword(password: string): Promise<boolean> {
  const raw = await SecureStore.getItemAsync(PASSWORD_KEY, OPTIONS);
  if (!raw) return false;
  const record: PasswordRecord = JSON.parse(raw);
  return hashPassword(password, record.salt, record.iterations) === record.hash;
}

export async function loadSecret(): Promise<WalletSecret | null> {
  const raw = await SecureStore.getItemAsync(SECRET_KEY, OPTIONS);
  return raw ? JSON.parse(raw) : null;
}

export async function wipeSecrets(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(SECRET_KEY, OPTIONS),
    SecureStore.deleteItemAsync(PASSWORD_KEY, OPTIONS),
    SecureStore.deleteItemAsync(BIOMETRICS_KEY, OPTIONS),
  ]);
}

export async function biometricsAvailable(): Promise<boolean> {
  const [hardware, enrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  return hardware && enrolled;
}

export async function isBiometricsEnabled(): Promise<boolean> {
  return (await SecureStore.getItemAsync(BIOMETRICS_KEY, OPTIONS)) === 'true';
}

export async function setBiometricsEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(BIOMETRICS_KEY, enabled ? 'true' : 'false', OPTIONS);
}

export async function authenticateBiometric(prompt: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: prompt,
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}
