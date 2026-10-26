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
