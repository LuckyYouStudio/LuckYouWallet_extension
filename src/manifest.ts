export default {
  manifest_version: 3,
  name: 'LuckYou Wallet',
  version: '0.1.0',
  icons:{
    16: 'icons/icon16.png',
    32: 'icons/icon32.png',
    48: 'icons/icon48.png',
    64: 'icons/icon64.png',
    128: 'icons/icon128.png' 
  },
  action: {
    default_popup: 'popup.html',
    default_title: 'LuckYou Wallet'
  },
  permissions: [
    'storage'
  ],
  host_permissions: [
    "<all_urls>"
  ]
};
