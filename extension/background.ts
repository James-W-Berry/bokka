// Minimal background: content scripts can't open the options page themselves,
// so they message us and we open it. Chrome runs this as a service worker,
// Firefox as an event page (see build-extension.mjs).

declare const chrome: any

chrome.runtime.onMessage.addListener((msg: { type?: string }) => {
  if (msg?.type === 'bokka:open-options') chrome.runtime.openOptionsPage()
})
