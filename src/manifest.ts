import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'LuckYou Wallet',
  version: '0.1.0',
  description: 'A secure and user-friendly Web3 wallet extension',
  icons: {
    '16': 'icons/icon16.png',
    '32': 'icons/icon32.png',
    '48': 'icons/icon48.png',
    '64': 'icons/icon64.png',
    '128': 'icons/icon128.png'
  },
  action: {
    default_popup: 'popup.html',
    default_title: 'LuckYou Wallet'
  },
  permissions: [
    'storage',
    'activeTab',
    'scripting'
  ],
  host_permissions: [
    '<all_urls>'
  ],
  background: {
    service_worker: 'background.js',
    type: 'module'
  },
  content_scripts: [
    {
      js: ['content.js'],
      matches: ['<all_urls>'],
      run_at: 'document_start'
    }
  ],
  web_accessible_resources: [
    {
      resources: ['provider.js', 'inject.js'],
      matches: ['<all_urls>']
    }
  ],
  content_security_policy: {
    extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
  }
});
