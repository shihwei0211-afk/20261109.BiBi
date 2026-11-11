const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
(async () => {
  const prefix = '/20261109.BiBi/';
  const server = http.createServer(async (req, res) => {
    try {
      let name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (!name.startsWith(prefix)) return res.writeHead(404).end();
      name = name.slice(prefix.length) || 'index.html';
      if (name.includes('..')) return res.writeHead(404).end();
      const type = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png' }[path.extname(name)];
      res.setHeader('Content-Type', type || 'application/octet-stream');
      res.end(await fs.readFile(path.join(__dirname, '..', name)));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.route("https://**/*", route => route.abort());
    const base = `http://127.0.0.1:${server.address().port}${prefix}`;
    await page.goto(base);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const manifest = await page.evaluate(async () => (await fetch('./manifest.webmanifest')).json());
    assert.equal(manifest.display, 'standalone');
    assert.equal(new URL(manifest.start_url, base).href, base);
    for (const icon of manifest.icons) {
      const response = await page.request.get(new URL(icon.src, base).href);
      assert.equal(response.status(), 200);
    }
    await page.screenshot({ path: '/tmp/pwa-mobile.png' });
    await context.setOffline(true);
    await page.waitForFunction(() => !document.querySelector('#connection-notice').hidden);
    await page.reload();
    await page.getByRole('heading', { name: '目前無法連線' }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: '/tmp/pwa-offline.png' });
    const cached = await page.evaluate(async () => {
      const keys = await caches.keys();
      const urls = [];
      for (const key of keys) for (const request of await (await caches.open(key)).keys()) urls.push(request.url);
      return urls;
    });
    assert.equal(cached.length, 4);
    assert(cached.every(url => url.startsWith(base)));
    assert(!cached.some(url => /supabase|config\.js|app\.js/.test(url)));
    await context.setOffline(false);
    await page.getByRole('link', { name: '重新開啟報修登記' }).click();
    await page.getByRole('heading', { name: /需要協助嗎/ }).waitFor();
    console.log('PWA: 子路徑、manifest、圖示、SW、離線提示與導覽、快取範圍、恢復連線通過');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
