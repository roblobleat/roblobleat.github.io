(() => {
  'use strict';
  const paths = {
    'arrow-up-right': '<path d="M7 17 17 7M7 7h10v10"/>',
    'arrow-down': '<path d="M12 4v16m-6-6 6 6 6-6"/>',
    'arrow-up': '<path d="M12 20V4m-6 6 6-6 6 6"/>',
    'arrow-right': '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    play: '<path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none"/>',
    pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
    reset: '<path d="M3 10a9 9 0 1 1 2.7 8M3 4v6h6"/>',
    shuffle: '<path d="m18 3 3 3-3 3m0 6 3 3-3 3M3 6h3c4 0 8 12 12 12h3M3 18h3c1.5 0 3-1.7 4.5-4M14 8c1.5-1.5 2.5-2 4-2h3"/>',
    cursor: '<path d="m4 3 7 18 2-8 8-2Z"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
    sliders: '<path d="M4 4v5m0 4v7M12 4v9m0 4v3M20 4v2m0 4v10M1 9h6m2 8h6m2-11h6"/>',
    zip: '<path d="M13 3H5v18h14V9Zm0 0v6h6M9 3v2m0 2v2m0 2v2m0 2v2"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
    unlock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2M12 14v3"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v.1"/>',
    alert: '<path d="m12 3 10 18H2Zm0 6v5m0 3v.1"/>',
    edit: '<path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14Z"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    'eye-off': '<path d="m3 3 18 18M10.5 5.2A12 12 0 0 1 12 5c6 0 10 7 10 7a20 20 0 0 1-3 3.7M6.2 6.2A22 22 0 0 0 2 12s4 7 10 7a12 12 0 0 0 5.8-1.8M10 10a3 3 0 0 0 4 4"/>',
    sort: '<path d="M8 4v16m-4-4 4 4 4-4M14 5h7m-7 5h5m-5 5h3"/>',
    volume: '<path d="M11 4 6 8H2v8h4l5 4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    'volume-off': '<path d="M11 4 6 8H2v8h4l5 4Zm5 5 6 6m-6 0 6-6"/>',
    plus: '<path d="M12 4v16M4 12h16"/>',
    logout: '<path d="M9 4H3v16h6M9 12h12m-5-5 5 5-5 5"/>',
    monitor: '<rect x="3" y="3" width="18" height="13" rx="2"/><path d="M12 16v5m-5 0h10"/>',
    folder: '<path d="M3 5h6l2 3h10v12H3Z"/>'
  };
  const icon = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.info}</svg>`;
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const categories = { effects: 'Эффекты', instruments: 'Инструменты', presets: 'Пресеты', drumkits: 'Драм-киты', projects: 'FLP-проекты', other: 'Другое' };
  const e = escapeHTML;
  const formatSize = bytes => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} МБ` : `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  const pad = n => String(n).padStart(2, '0');
  const formatDate = value => new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
  function hydrateIcons(root = document) {
    root.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
  }
  function toast(message, type = 'success') {
    const container = document.getElementById('toasts');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast ${type === 'error' ? 'error' : ''}`;
    el.innerHTML = icon(type === 'error' ? 'alert' : 'check-circle');
    const text = document.createElement('span');
    text.textContent = message;
    el.append(text);
    container.append(el);
    setTimeout(() => { el.classList.add('leaving'); setTimeout(() => el.remove(), 220); }, 4800);
  }
  async function api(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const token = sessionStorage.getItem('pluglab-token');
    if (token) headers.Authorization = `Bearer ${token}`;
    let response;
    try { response = await fetch(url, { ...options, headers, cache: 'no-store' }); }
    catch { throw new Error('Нет связи с сервером. Проверьте подключение и попробуйте ещё раз.'); }
    let data;
    try { data = await response.json(); } catch { data = {}; }
    if (!response.ok) {
      const error = new Error(data.error || `Ошибка сервера (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return data;
  }
  function openDialog(dialog) {
    if (typeof dialog === 'string') dialog = document.getElementById(dialog);
    if (!dialog || dialog.open) return;
    dialog.showModal();
    document.body.classList.add('modal-open');
  }
  function closeDialog(dialog) {
    if (typeof dialog === 'string') dialog = document.getElementById(dialog);
    if (dialog?.open) dialog.close();
  }
  const guideContent = `<div class="modal-header"><span class="eyebrow">БЫСТРЫЙ СТАРТ</span><button class="icon-button" data-close-dialog aria-label="Закрыть инструкцию">${icon('close')}</button></div><h2 id="guide-title">ДОБАВЬ В СВОЮ СТУДИЮ.</h2><p class="muted">Точные шаги зависят от плагина. Сначала прочитай инструкцию внутри архива.</p><ol class="guide-steps"><li><strong>Распакуй ZIP-архив.</strong><p>Не запускай установщик прямо из архива. Проверь формат: VST, VST3 или родной плагин FL Studio.</p></li><li><strong>Установи или скопируй файлы.</strong><p>Для установщика — запусти его и выбери папку VST. Для VST3 обычно используется <code>C:\\Program Files\\Common Files\\VST3</code> на Windows или <code>/Library/Audio/Plug-Ins/VST3</code> на macOS. Совместимость с ОС указана в карточке.</p></li><li><strong>Обнови Plugin Manager.</strong><p>В FL Studio открой Options → Manage plugins. Проверь папку установки и нажми Find installed plugins.</p></li><li><strong>Добавь на дорожку.</strong><p>Инструмент — в Channel Rack, эффект — в слот микшера. Для пресетов и .flp следуй инструкции автора внутри архива.</p></li></ol><div class="notice">${icon('info')}<span>Скачивай только те плагины, которым доверяешь. Проверяй архив антивирусом и используй лицензионное ПО.</span></div><button class="btn btn-orange full-width" data-close-dialog>Понятно ${icon('check')}</button>`;
  function openGuide() {
    let dialog = document.getElementById('guide-dialog');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'guide-dialog';
      dialog.className = 'modal guide-modal';
      dialog.setAttribute('aria-labelledby', 'guide-title');
      dialog.innerHTML = guideContent;
      document.body.append(dialog);
    }
    openDialog(dialog);
  }
  function pluginArt(p) {
    const category = categories[p.category] ? p.category : 'other';
    const accent = ['orange', 'lime', 'blue', 'silver'].includes(p.accent) ? p.accent : 'orange';
    let motif;
    if (category === 'effects') motif = '<div class="motif-knob"></div>';
    else if (category === 'instruments') motif = '<div class="motif-keys"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><b></b><b></b><b></b><b></b><b></b></div>';
    else if (category === 'presets') motif = `<div class="motif-wave">${[24, 43, 68, 89, 57, 100, 73, 45, 82, 61, 35, 20].map(h => `<i style="height:${h}px"></i>`).join('')}</div>`;
    else if (category === 'drumkits') motif = `<div class="motif-pads">${'<i></i>'.repeat(16)}</div>`;
    else if (category === 'projects') motif = '<div class="motif-project"><i></i><i></i><i></i><i></i></div>';
    else motif = '<div class="motif-zip">ZIP</div>';
    return `<div class="plugin-art art-${accent}" aria-hidden="true"><div class="art-grid"></div><div class="plugin-art-top"><span class="art-badge">ZIP</span><span class="art-category">${e(categories[category])}</span></div><div class="plugin-art-motif">${motif}</div><span class="art-serial">PLUGLAB / SOUND OBJECTS</span><span class="art-format">${e(p.version)}</span></div>`;
  }
  function pluginCard(p, admin = false) {
    const id = e(p.id);
    return `<article class="plugin-card" data-plugin-id="${id}">
      <button class="card-art-button" data-detail="${id}" aria-label="Подробнее: ${e(p.title)}">${pluginArt(p)}</button>
      <div class="plugin-card-body"><div class="plugin-card-heading"><button class="plugin-title" data-detail="${id}">${e(p.title)}</button><span class="plugin-version">v${e(p.version)}</span></div>
      <span class="plugin-author">${e(p.author)}</span><p class="plugin-description">${e(p.description)}</p>
      <div class="plugin-tags">${(p.tags || []).map(t => `<span class="plugin-tag">${e(t)}</span>`).join('')}</div>
      <div class="plugin-meta"><span>${icon('monitor')}${e(p.compatibility.join(' / '))}</span><span>${icon('download')}${e(p.downloads)}</span><span>${formatSize(p.size)}</span></div>
      <div class="plugin-card-actions"><a href="${e(p.downloadUrl)}" class="btn btn-orange plugin-download" data-download="${id}" download>Скачать ${icon('download')}</a><button class="icon-button" data-detail="${id}" aria-label="Информация о ${e(p.title)}">${icon('info')}</button></div>
      ${admin ? `<div class="admin-card-actions"><button data-edit="${id}">${icon('edit')} Изменить</button><button data-delete="${id}">${icon('trash')} Удалить</button></div>` : ''}</div></article>`;
  }
  document.addEventListener('click', event => {
    const close = event.target.closest('[data-close-dialog]');
    if (close) { closeDialog(close.closest('dialog')); return; }
    if (event.target.closest('[data-open-guide]')) { openGuide(); return; }
    const download = event.target.closest('[data-download]');
    if (download) toast('Скачивание началось. Инструкция по установке — в каталоге.');
    const dialog = event.target;
    if (dialog instanceof HTMLDialogElement && dialog.open) {
      const r = dialog.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeDialog(dialog);
    }
  });
  document.addEventListener('close', event => {
    if (event.target instanceof HTMLDialogElement && !document.querySelector('dialog[open]')) document.body.classList.remove('modal-open');
  }, true);
  const menuButton = document.querySelector('.menu-toggle');
  const nav = document.getElementById('main-nav');
  if (menuButton && nav) {
    menuButton.addEventListener('click', () => {
      const open = menuButton.getAttribute('aria-expanded') !== 'true';
      menuButton.setAttribute('aria-expanded', String(open));
      menuButton.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
      nav.classList.toggle('open', open);
    });
    nav.addEventListener('click', event => {
      if (event.target.closest('a')) { nav.classList.remove('open'); menuButton.setAttribute('aria-expanded', 'false'); menuButton.setAttribute('aria-label', 'Открыть меню'); }
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && nav.classList.contains('open')) { nav.classList.remove('open'); menuButton.setAttribute('aria-expanded', 'false'); menuButton.focus(); } });
  }
  document.querySelectorAll('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });
  hydrateIcons();
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
    }), { threshold: 0.06 });
    document.querySelectorAll('.reveal').forEach(el => { el.classList.add('will-reveal'); observer.observe(el); });
  }
  window.PL = { icon, escapeHTML: e, categories, formatSize, formatDate, pad, hydrateIcons, toast, api, openDialog, closeDialog, openGuide, pluginArt, pluginCard };
})();
