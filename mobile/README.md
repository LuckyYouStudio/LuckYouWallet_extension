# LuckYou Wallet — iOS App

The iOS version of LuckYou Wallet, built with **Expo SDK 58 + React Native + Expo Router**. It shares the wallet core with the browser extension (`../src/core/wallet.ts`, built on ethers v6).

## Directory layout

```
mobile/
├── index.ts                 # Entry point: installs crypto polyfill, then loads Expo Router
├── metro.config.js          # Pulls in ../src/core; its dependencies resolve from mobile/node_modules
├── app.json                 # App config (bundle ID, Face ID permission, icon, etc.)
├── eas.json                 # EAS build / submit config
├── PRIVACY.md               # Privacy policy draft (required for App Store submission)
└── src/
    ├── app/                 # Routes (Expo Router)
    │   ├── _layout.tsx      # Root navigation: routes are guarded by state (onboarding / locked / unlocked)
    │   ├── (onboarding)/    # Welcome, create (back up recovery phrase), import, set password
    │   ├── unlock.tsx       # Unlock with password / Face ID
    │   └── (wallet)/        # Home, send, confirm, receive, activity, tokens, networks, settings, view secret
    ├── components/          # UI components
    ├── lib/
    │   ├── vault.ts         # Keychain vault: secrets, password hash, Face ID
    │   ├── storage.ts       # AsyncStorage adapter (non-sensitive data only)
    │   ├── useAuthorize.ts  # Re-verifies identity before sensitive actions
    │   └── i18n.ts          # English / Chinese strings
    ├── state/WalletContext.tsx
    └── theme.ts             # Design tokens shared with the extension
```

## Supported chains (same as MetaMask's defaults)

| Type | Networks |
| --- | --- |
| EVM (shared with the extension) | Ethereum, Linea, Base, Arbitrum One, OP Mainnet, Polygon, BNB Chain, Avalanche C-Chain, zkSync Era, Sei, Monad, HyperEVM, MegaETH; testnets Sepolia and Linea Sepolia |
| Non-EVM (app only) | Bitcoin, Solana, Tron; testnets Bitcoin Testnet4, Solana Devnet and Tron Nile |

- One recovery phrase derives every chain. The paths match the major wallets, so importing the same phrase into MetaMask / Phantom / TronLink gives the same addresses:
  BTC `m/84'/0'/0'/0/0` (native SegWit bc1…), SOL `m/44'/501'/0'/0'`, TRX `m/44'/195'/0'/0/0`, EVM `m/44'/60'/0'/0/0`.
- Wallets imported from a private key only support EVM networks.
- Built-in popular tokens are detected automatically (any with a balance are shown). Addresses and decimals were checked on-chain: `src/core/tokens.ts` (EVM), plus the token lists in `mobile/src/chains/solana.ts` and `tron.ts`.
- Tron transactions are built by the node; before signing, the app checks locally that the txID matches the transaction body, and that the body contains the expected recipient, amount and contract.
- Public endpoints: mempool.space (BTC), api.mainnet-beta.solana.com (SOL), TronGrid (TRX, about 3 requests/second; retries automatically when rate-limited). For heavy use, apply for an API key.

## Security design

| Item | Approach |
| --- | --- |
| Recovery phrase / private key | `expo-secure-store` → iOS Keychain, `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (this device only, not migrated by iCloud backup) |
| App password | PBKDF2-SHA256 (60k iterations, random salt); only the hash is stored in the Keychain |
| Face ID | `expo-local-authentication`, optional |
| Sensitive actions | Sending a transaction or viewing the recovery phrase/private key requires Face ID or the password again |
| Auto-lock | Locks after more than 5 minutes in the background |
| App switcher | Content is covered when the app goes to the background, so the recovery phrase never appears in the system snapshot |
| Reinstall | Leftover Keychain data is wiped on first launch |
| Clipboard | Cleared automatically 60 seconds after copying the private key/recovery phrase |

## Local development

```bash
cd mobile
npm install
# If CocoaPods errors with "Unicode Normalization not appropriate for ASCII-8BIT", set a UTF-8 locale first:
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
npx expo run:ios          # Build a development build and run it in the simulator
```

> The app uses native modules such as Keychain, Face ID and SF Symbols, so **it cannot run in Expo Go**. Use a development build.

Checks:

```bash
npx tsc --noEmit
npx expo lint
npx expo-doctor
```

### Release config already in place
- **Privacy manifest** (`ios.privacyManifests` in `app.json`): no tracking, no data collected, plus declarations for the system APIs React Native uses.
- **Export compliance**: `ITSAppUsesNonExemptEncryption = false` (only standard algorithms for signing/hashing; no proprietary encryption).
- **Home-screen name** "LuckYou"; the Face ID prompt has Chinese/English localization (`locales/`).
- **Release builds** disable `console.log/info/debug`, so addresses and other details don't reach the system log.
- **Backup verification**: after creating a wallet, the user must pick 3 random words of the recovery phrase correctly before setting a password.
- **Error fallback**: if reading the Keychain fails at startup, a retry screen appears (it never assumes there's no wallet, so an existing wallet can't be overwritten); render errors show a recoverable error screen.

## Releasing to the App Store

1. **Prerequisites**
   - Join the [Apple Developer Program](https://developer.apple.com/programs/) ($99/year). For a company account you also need a D-U-N-S number (crypto wallets are recommended to publish under an organization account).
   - In [App Store Connect](https://appstoreconnect.apple.com), create the app with bundle ID `com.luckyoustudio.wallet` (to change it, edit `ios.bundleIdentifier` in `app.json`).
   - Fill the App Store Connect app ID into `submit.production.ios.ascAppId` in `eas.json`.
2. **Build and submit**
   ```bash
   npx eas-cli@latest login
   npx eas-cli@latest build --platform ios --profile production
   npx eas-cli@latest submit --platform ios --profile production
   ```
   EAS creates and manages the certificates and provisioning profiles automatically.
3. **Store listing**
   - Privacy policy URL: publish `PRIVACY.md` as a web page and enter its URL.
   - App privacy (data collection questionnaire): choose "Data Not Collected".
   - Category: Finance.
   - Screenshots: 6.9" (iPhone 17 Pro Max) is required; capture them from the simulator.
   - Export compliance: `ITSAppUsesNonExemptEncryption` is already set to `false` (only system-provided encryption is used).
4. **Review notes (important)**
   - In the "Notes" field, state that this is a **non-custodial wallet**: users hold their own keys, the developer cannot access user assets, and the app offers no exchange or trading service. This addresses App Review Guideline 3.1.5(b) / 5.3.
   - The app does not include an in-app DApp browser, which avoids related review risk.
   - If you add swaps or fiat on-ramps in a later version, you may need financial licenses for the relevant regions.

## Not yet implemented (later iterations)

- Custom networks (the extension supports them; on mobile you can only switch between built-in networks)
- WalletConnect (connecting to DApps)
- Multiple accounts / HD derivation of more addresses
- Fiat pricing for balances
- On-chain history (currently only transactions sent from this device are recorded)
