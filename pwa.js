(() => {
  'use strict';
  const notice = document.querySelector('#connection-notice');
  const installButton = document.querySelector('#install-button');
  let installPrompt;
  function updateConnection() {
    notice.hidden = navigator.onLine;
  }
  window.addEventListener('online', updateConnection);
  window.addEventListener('offline', updateConnection);
  updateConnection();
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    installButton.hidden = false;
  });
  installButton.addEventListener('click', async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = undefined;
    installButton.hidden = true;
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = undefined;
    installButton.hidden = true;
  });
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {
        // 註冊失敗不影響一般網頁的報修功能。
        console.warn('離線頁面未能啟用，仍可連線使用報修網頁。');
      });
    });
  }
})();
