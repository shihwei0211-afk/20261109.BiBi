(() => {
  'use strict';

  const form = document.querySelector('#repair-form');
  const fields = document.querySelector('#form-fields');
  const submitButton = document.querySelector('#submit-button');
  const refreshButton = document.querySelector('#refresh-button');
  const formMessage = document.querySelector('#form-message');
  const listMessage = document.querySelector('#list-message');
  const list = document.querySelector('#request-list');
  const categories = ['設備', '網路', '環境', '其他'];
  const urgencies = ['低', '中', '高'];
  let client;
  let submitting = false;

  function message(element, text, kind = '') {
    element.textContent = text;
    element.className = `message ${kind}`.trim();
    element.hidden = !text;
  }

  function errorText(error) {
    const code = typeof error?.code === 'string' ? error.code : '';
    const suffix = /^[A-Z0-9]{3,12}$/.test(code) ? `（錯誤代碼：${code}）` : '';
    if (error?.code === '42501') return '目前沒有操作權限，請聯絡管理員確認存取設定。';
    if (error?.code === '23514' || error?.code === '23502') return '資料不符合欄位規則，請檢查填寫內容。';
    if (['PGRST205', '42P01'].includes(code)) return `找不到報修資料表，請聯絡管理員確認資料庫已完成建表。${suffix}`;
    if (['PGRST204', '42703'].includes(code)) return `報修資料表欄位與網頁不一致，請聯絡管理員確認資料表結構。${suffix}`;
    if (code === 'PGRST106') return `報修資料表所在的 schema 未開放 API 存取，請聯絡管理員。${suffix}`;
    if (error?.httpStatus === 401 || ['PGRST301', 'PGRST302', 'PGRST303'].includes(code)) {
      return `專案金鑰或驗證設定未通過，請聯絡管理員確認專案網址與公開金鑰。${suffix}`;
    }
    if (error?.httpStatus === 403) return `目前沒有讀寫權限，請聯絡管理員確認存取設定。${suffix}`;
    if (error?.httpStatus === 429) return '請求次數過多，請稍候再試。';
    if (error?.httpStatus >= 500) return `資料服務暫時異常，請稍後再試。${suffix}`;
    if (code || error?.httpStatus >= 400) return `資料服務拒絕此請求，請聯絡管理員。${suffix}`;
    return '無法連線到資料服務，請檢查網路；若持續發生，請管理員確認專案網址及服務是否正常運作。';
  }

  // 所有資料都透過 textContent 顯示，避免報修文字被當成 HTML 執行。
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function renderRequests(requests) {
    const fragment = document.createDocumentFragment();
    const formatter = new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei', dateStyle: 'medium', timeStyle: 'short',
    });
    for (const request of requests) {
      const card = element('li', 'request-card');
      const heading = element('div', 'card-heading');
      const statusClass = request.status === '已完成' ? 'done' : request.status === '處理中' ? 'progress' : '';
      heading.append(element('h3', '', request.location), element('span', `badge ${statusClass}`, request.status));
      const meta = element('div', 'card-meta');
      meta.append(element('span', '', `報修人：${request.reporter_name}`), element('span', 'badge', request.category));
      meta.append(element('span', request.urgency === '高' ? 'urgency-high' : '', `緊急程度：${request.urgency}`));
      const time = element('time');
      const date = new Date(request.created_at);
      if (Number.isNaN(date.getTime())) {
        time.textContent = '登記時間不明';
      } else {
        time.dateTime = date.toISOString();
        time.textContent = `${formatter.format(date)}（台北）`;
      }
      meta.append(time);
      card.append(heading, element('p', 'description', request.description), meta);
      fragment.append(card);
    }
    list.replaceChildren(fragment);
  }

  async function loadRequests() {
    refreshButton.disabled = true;
    list.setAttribute('aria-busy', 'true');
    message(listMessage, '正在載入報修清單…');
    try {
      const { data, error, status } = await client.from('repair_requests')
        .select('id,created_at,reporter_name,location,category,description,urgency,status')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(20);
      if (error) throw { ...error, httpStatus: status };
      renderRequests(data ?? []);
      message(listMessage, data?.length ? '' : '目前還沒有報修紀錄，歡迎新增第一筆。');
    } catch (error) {
      message(listMessage, `清單讀取失敗。${errorText(error)}${list.children.length ? '下方保留上次載入的資料。' : ''}`, 'error');
    } finally {
      list.setAttribute('aria-busy', 'false');
      refreshButton.disabled = false;
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!client || submitting) return;
    // 僅送出五個使用者輸入欄位；status、id、created_at 由資料庫產生。
    const values = new FormData(form);
    const payload = {
      reporter_name: String(values.get('reporter_name') ?? '').trim(),
      location: String(values.get('location') ?? '').trim(),
      category: String(values.get('category') ?? ''),
      description: String(values.get('description') ?? '').trim(),
      urgency: String(values.get('urgency') ?? ''),
    };
    for (const [name, max] of [['reporter_name', 100], ['location', 200], ['description', 2000]]) {
      const input = form.elements.namedItem(name);
      input.setCustomValidity(payload[name] && [...payload[name]].length <= max ? '' : `請填寫 1～${max} 字，且不可只有空白。`);
    }
    form.elements.namedItem('category').setCustomValidity(categories.includes(payload.category) ? '' : '請選擇有效類別。');
    form.elements.namedItem('urgency').setCustomValidity(urgencies.includes(payload.urgency) ? '' : '請選擇有效緊急程度。');
    if (!form.reportValidity()) return;

    submitting = true;
    fields.disabled = true;
    form.setAttribute('aria-busy', 'true');
    submitButton.textContent = '正在送出…';
    message(formMessage, '正在登記報修，請稍候…');
    try {
      const { error, status } = await client.from('repair_requests').insert(payload);
      if (error) throw { ...error, httpStatus: status };
      form.reset();
      message(formMessage, '報修已成功送出！目前狀態為「待處理」。', 'success');
      await loadRequests();
    } catch (error) {
      message(formMessage, `未能確認送出結果。${errorText(error)}內容已保留；重送前請先重新整理清單，避免重複登記。`, 'error');
    } finally {
      submitting = false;
      fields.disabled = false;
      form.setAttribute('aria-busy', 'false');
      submitButton.textContent = '送出報修 ↗';
    }
  });

  form.addEventListener('input', (event) => {
    if (typeof event.target.setCustomValidity === 'function') event.target.setCustomValidity('');
  });
  refreshButton.addEventListener('click', loadRequests);

  try {
    const config = window.REPAIR_CONFIG;
    if (!window.supabase?.createClient || !config?.supabaseUrl || !config?.supabasePublishableKey) {
      throw new Error('缺少連線設定或 Supabase 程式庫');
    }
    client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    fields.disabled = false;
    void loadRequests();
  } catch {
    message(formMessage, '連線程式未能載入，請重新整理頁面或聯絡管理員。', 'error');
    message(listMessage, '目前無法載入清單。', 'error');
    list.setAttribute('aria-busy', 'false');
  }
})();
