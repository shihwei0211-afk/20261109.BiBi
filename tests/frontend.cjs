// 使用真正的 supabase-js CDN 程式庫及模擬 API，不寫入遠端資料庫。
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const name = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (!['index.html', 'style.css', 'config.js', 'app.js'].includes(name)) {
      res.writeHead(404).end();
      return;
    }
    const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
    res.setHeader('Content-Type', `${types[path.extname(name)]}; charset=utf-8`);
    res.end(await fs.readFile(path.join(root, name)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
      headless: true,
    });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // CI 可提供離線 CDN 快取；正式 HTML 仍從 CDN 載入固定版本的 v2。
    if (process.env.SUPABASE_SDK_PATH) {
      await page.route('https://cdn.jsdelivr.net/**', route => route.fulfill({
        path: process.env.SUPABASE_SDK_PATH, contentType: 'text/javascript',
      }));
    }
    let failRead = false;
    let readFailure = { status: 503, body: { message: 'Unavailable' } };
    let failInsert = false;
    let posts = [];
    const records = Array.from({ length: 20 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      created_at: new Date(Date.UTC(2026, 10, 11, 12 - i)).toISOString(),
      reporter_name: '示範同事甲', location: `虛構園區 ${i + 1}`,
      category: '設備', description: i === 0 ? '<img src=x onerror="window.injected=true">' : '虛構設備無法啟動',
      urgency: '中', status: '待處理',
    }));
    await page.route('https://*.supabase.co/**', async route => {
      const req = route.request();
      if (req.method() === 'POST') {
        posts.push(req.postDataJSON());
        await new Promise(resolve => setTimeout(resolve, 120));
        await route.fulfill({ status: failInsert ? 403 : 201, contentType: 'application/json',
          body: failInsert ? JSON.stringify({ code: '42501', message: 'denied' }) : '' });
      } else {
        const url = new URL(req.url());
        assert.equal(url.searchParams.get('limit'), '20');
        assert.equal(url.searchParams.get('order'), 'created_at.desc,id.desc');
        await route.fulfill({ status: failRead ? readFailure.status : 200, contentType: 'application/json',
          body: failRead ? JSON.stringify(readFailure.body) : JSON.stringify(records) });
      }
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForSelector('.request-card');
    assert.equal(await page.locator('.request-card').count(), 20);
    assert.match(await page.locator('.request-card').first().textContent(), /虛構園區 1/);
    assert.equal(await page.locator('.request-card img').count(), 0);
    assert.equal(await page.evaluate(() => window.injected), undefined);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator('#urgency').inputValue(), '中');
    await page.locator('#submit-button').click();
    assert.equal(posts.length, 0, '空表單不可送出');
    async function fill() {
      await page.locator('#reporter-name').fill('  示範同事乙  ');
      await page.locator('#location').fill(' 虛構部門 ');
      await page.locator('#category').selectOption('網路');
      await page.locator('#description').fill(' 無線網路不穩 ');
    }
    await fill();
    await page.locator('#reporter-name').fill('   ');
    await page.locator('#submit-button').click();
    assert.equal(posts.length, 0, '純空白不可送出');
    await page.locator('#reporter-name').fill('  示範同事乙  ');
    await page.locator('#submit-button').click();
    await page.waitForFunction(() => document.querySelector('#form-message').classList.contains('success'));
    assert.deepEqual(posts[0], {
      reporter_name: '示範同事乙', location: '虛構部門', category: '網路', description: '無線網路不穩', urgency: '中',
    });
    assert.equal(await page.locator('#reporter-name').inputValue(), '');
    await fill();
    failInsert = true;
    await page.locator('#submit-button').click();
    await page.waitForFunction(() => document.querySelector('#form-message').classList.contains('error'));
    assert.equal(await page.locator('#location').inputValue(), ' 虛構部門 ');
    assert.equal(await page.locator('#submit-button').isEnabled(), true);
    failRead = true;
    await page.locator('#refresh-button').click();
    await page.waitForFunction(() => document.querySelector('#list-message').classList.contains('error'));
    assert.equal(await page.locator('.request-card').count(), 20, '讀取失敗保留舊清單');
    for (const [status, body, expected] of [
      [404, { code: 'PGRST205', message: 'Missing table' }, '找不到報修資料表'],
      [400, { code: '42703', message: 'Missing column' }, '欄位與網頁不一致'],
      [401, { message: 'Invalid API key' }, '專案金鑰或驗證設定未通過'],
      [403, { code: '42501', message: 'Permission denied' }, '目前沒有操作權限'],
      [429, { message: 'Rate limited' }, '請求次數過多'],
      [503, { message: 'Unavailable' }, '資料服務暫時異常'],
    ]) {
      readFailure = { status, body };
      await page.locator('#refresh-button').click();
      await page.waitForFunction(text => document.querySelector('#list-message').textContent.includes(text), expected);
    }
    failRead = false;
    failInsert = false;
    records.length = 0;
    await page.locator('#refresh-button').click();
    await page.waitForFunction(() => document.querySelector('#list-message').textContent.includes('目前還沒有'));
    assert.equal(await page.locator('.request-card').count(), 0);
    // 新增成功但清單更新失敗時，仍清楚保留新增成功訊息。
    failRead = true;
    await page.locator('#submit-button').click();
    await page.waitForFunction(() => document.querySelector('#form-message').classList.contains('success') && document.querySelector('#list-message').classList.contains('error'));
    failRead = false;
    records.push({ id: 'demo', created_at: '2026-11-11T04:00:00Z', reporter_name: '示範同事甲', location: '虛構園區 A 棟', category: '設備', description: '投影設備無法開機，需要協助檢查。', urgency: '中', status: '待處理' });
    await page.locator('#refresh-button').click();
    await page.waitForSelector('.request-card');
    const screenshots = process.env.SCREENSHOT_DIR;
    if (screenshots) {
      await fs.mkdir(screenshots, { recursive: true });
      await page.screenshot({ path: path.join(screenshots, 'mobile.png'), fullPage: true });
    }
    await page.setViewportSize({ width: 1280, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (screenshots) await page.screenshot({ path: path.join(screenshots, 'desktop.png'), fullPage: true });
    // CDN 失效時停用表單並提供訊息。
    const offline = await browser.newPage();
    await offline.route('https://cdn.jsdelivr.net/**', route => route.abort());
    await offline.goto(`http://127.0.0.1:${server.address().port}/`);
    await offline.waitForFunction(() => document.querySelector('#form-message').classList.contains('error'));
    assert.equal(await offline.locator('#submit-button').isDisabled(), true);
    assert.deepEqual(errors, []);
    console.log('瀏覽器驗證通過：手機與桌面、20 筆排序查詢、必填與空白、五欄新增、成功與失敗、空清單、XSS、CDN 失效。');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
