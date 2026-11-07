(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const e = PL.escapeHTML;
  const state = { plugins: [], category: 'all', query: '', sort: 'newest', admin: false, loaded: false, maxUploadBytes: 100 * 1024 * 1024, editingId: null, detailId: null, deletingId: null };
  let selectedFile = null;
  let uploadRequest = null;
  let uploading = false;
  let loadSequence = 0;
  const filterRoot = $('category-filters');
  filterRoot.innerHTML = [['all', 'Всё'], ...Object.entries(PL.categories)].map(([value, label]) => `<button class="filter-chip ${value === 'all' ? 'active' : ''}" data-category="${value}" aria-pressed="${value === 'all'}">${label}<span data-count="${value}">0</span></button>`).join('');
  const initialParams = new URLSearchParams(location.search);
  if (PL.categories[initialParams.get('category')]) state.category = initialParams.get('category');
  state.query = (initialParams.get('q') || '').slice(0, 160);
  $('catalog-search').value = state.query;

  function syncURL() {
    const url = new URL(location.href);
    url.search = '';
    if (state.category !== 'all') url.searchParams.set('category', state.category);
    if (state.query) url.searchParams.set('q', state.query);
    url.searchParams.delete('admin'); url.searchParams.delete('plugin');
    history.replaceState(null, '', url);
  }
  function updateStats() {
    $('stat-plugins').textContent = PL.pad(state.plugins.length);
    $('stat-downloads').textContent = state.plugins.reduce((sum, p) => sum + p.downloads, 0).toLocaleString('ru-RU');
    document.querySelectorAll('[data-plugin-count]').forEach(el => { el.textContent = PL.pad(state.plugins.length); });
    document.querySelectorAll('[data-count]').forEach(el => {
      el.textContent = el.dataset.count === 'all' ? state.plugins.length : state.plugins.filter(p => p.category === el.dataset.count).length;
    });
  }
  function render() {
    if (!state.loaded) return;
    updateStats();
    $('clear-search').hidden = !state.query;
    filterRoot.querySelectorAll('[data-category]').forEach(button => {
      const active = button.dataset.category === state.category;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    });
    const query = state.query.trim().toLocaleLowerCase('ru');
    const words = query.split(/\s+/).filter(Boolean);
    let plugins = state.plugins.filter(p => (state.category === 'all' || p.category === state.category) && words.every(word => [p.title, p.author, p.description, ...(p.tags || []), PL.categories[p.category]].join(' ').toLocaleLowerCase('ru').includes(word)));
    plugins = [...plugins].sort((a, b) => state.sort === 'popular' ? b.downloads - a.downloads || new Date(b.createdAt) - new Date(a.createdAt) : state.sort === 'name' ? a.title.localeCompare(b.title, 'ru') : new Date(b.createdAt) - new Date(a.createdAt));
    $('plugin-grid').innerHTML = plugins.map(p => PL.pluginCard(p, state.admin)).join('');
    $('results-count').textContent = `${PL.pad(plugins.length)} ${state.category === 'all' && !query ? 'В БИБЛИОТЕКЕ' : 'ПО ТВОЕМУ ЗАПРОСУ'}${state.admin ? ' / РЕЖИМ АВТОРА' : ''}`;
    const empty = plugins.length === 0;
    $('catalog-empty').hidden = !empty;
    const noPlugins = state.plugins.length === 0;
    $('empty-title').textContent = noPlugins ? 'ПЕРВЫЙ РЕЛИЗ УЖЕ СКОРО.' : 'ПОКА НИЧЕГО НЕ НАШЛОСЬ.';
    $('empty-description').textContent = noPlugins ? 'Библиотека пока пустует. Здесь появятся авторские плагины — без регистрации, просто скачай и начни создавать.' : 'Попробуй другое название, автора или тег. Или посмотри всю библиотеку.';
    $('empty-action').hidden = !noPlugins || !state.admin;
    $('empty-browse').hidden = !noPlugins || state.admin;
    $('reset-filters').hidden = noPlugins;
    if (state.detailId && $('detail-dialog').open) {
      const p = state.plugins.find(item => item.id === state.detailId);
      if (p) renderDetail(p); else PL.closeDialog('detail-dialog');
    }
  }
  async function loadCatalog() {
    const sequence = ++loadSequence;
    $('catalog-loading').hidden = false;
    $('catalog-error').hidden = true;
    $('catalog-empty').hidden = true;
    $('plugin-grid').innerHTML = '';
    $('results-count').textContent = 'ЗАГРУЖАЕМ БИБЛИОТЕКУ';
    try {
      const data = await PL.api('/api/catalog');
      if (sequence !== loadSequence) return;
      state.plugins = data.plugins;
      state.maxUploadBytes = data.maxUploadBytes;
      state.loaded = true;
      $('catalog-loading').hidden = true;
      render();
      const pluginId = new URLSearchParams(location.search).get('plugin');
      if (pluginId) showDetail(pluginId);
    } catch (err) {
      if (sequence !== loadSequence) return;
      $('catalog-loading').hidden = true;
      $('catalog-error').hidden = false;
      $('catalog-error-message').textContent = err.message;
      $('results-count').textContent = 'БИБЛИОТЕКА ВРЕМЕННО НЕДОСТУПНА';
    }
  }
  function setAdmin(admin) {
    state.admin = admin;
    $('admin-bar').hidden = !admin;
    $('author-login-button').hidden = admin;
    $('footer-admin').innerHTML = `${PL.icon(admin ? 'unlock' : 'lock')} ${admin ? 'Управление каталогом' : 'Вход для автора'}`;
    render();
  }
  function handleAuthError(err) {
    if (err.status !== 401) return false;
    sessionStorage.removeItem('pluglab-token');
    setAdmin(false);
    PL.toast('Сессия истекла. Войдите снова.', 'error');
    return true;
  }
  function openLogin() {
    if (state.admin) { $('admin-bar').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' }); $('add-plugin').focus(); return; }
    $('login-form').reset(); $('login-error').textContent = '';
    $('admin-password').type = 'password';
    $('toggle-password').innerHTML = PL.icon('eye');
    $('toggle-password').setAttribute('aria-pressed', 'false');
    $('toggle-password').setAttribute('aria-label', 'Показать пароль');
    PL.openDialog('login-dialog');
  }
  $('author-login-button').addEventListener('click', openLogin);
  $('footer-admin').addEventListener('click', openLogin);
  $('toggle-password').addEventListener('click', () => {
    const show = $('admin-password').type === 'password';
    $('admin-password').type = show ? 'text' : 'password';
    $('toggle-password').innerHTML = PL.icon(show ? 'eye-off' : 'eye');
    $('toggle-password').setAttribute('aria-pressed', String(show));
    $('toggle-password').setAttribute('aria-label', show ? 'Скрыть пароль' : 'Показать пароль');
  });
  $('login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('[type=submit]');
    button.disabled = true; $('login-error').textContent = '';
    try {
      const data = await PL.api('/api/login', { method: 'POST', body: JSON.stringify({ password: $('admin-password').value }) });
      sessionStorage.setItem('pluglab-token', data.token);
      $('admin-password').value = '';
      PL.closeDialog('login-dialog');
      setAdmin(true);
      PL.toast('Ты в студии. Теперь можно добавлять плагины.');
    } catch (err) { $('login-error').textContent = err.message; }
    finally { button.disabled = false; }
  });
  $('logout').addEventListener('click', async () => {
    try { await PL.api('/api/logout', { method: 'POST' }); } catch {}
    sessionStorage.removeItem('pluglab-token'); setAdmin(false); PL.toast('Вы вышли из режима автора.');
  });

  filterRoot.addEventListener('click', event => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    state.category = button.dataset.category; render(); syncURL();
  });
  let searchTimer;
  $('catalog-search').addEventListener('input', event => {
    state.query = event.target.value.slice(0, 160);
    clearTimeout(searchTimer); searchTimer = setTimeout(() => { render(); syncURL(); }, 100);
  });
  $('clear-search').addEventListener('click', () => { state.query = ''; $('catalog-search').value = ''; render(); syncURL(); $('catalog-search').focus(); });
  $('catalog-sort').addEventListener('change', event => { state.sort = event.target.value; render(); });
  $('reset-filters').addEventListener('click', () => { state.category = 'all'; state.query = ''; $('catalog-search').value = ''; render(); syncURL(); });
  $('retry-catalog').addEventListener('click', loadCatalog);

  function renderDetail(p) {
    state.detailId = p.id;
    $('detail-content').innerHTML = `${PL.pluginArt(p)}<div class="detail-heading"><h2 id="detail-title">${e(p.title)}</h2><span class="plugin-version">v${e(p.version)}</span></div><p class="detail-author">${e(p.author)} / ${e(PL.categories[p.category])}</p><div class="plugin-tags">${p.tags.map(t => `<span class="plugin-tag">${e(t)}</span>`).join('')}</div><p class="detail-description">${e(p.description)}</p><div class="detail-specs"><div><span>СОВМЕСТИМОСТЬ</span><strong>${e(p.compatibility.join(' / '))}</strong></div><div><span>ФОРМАТ / РАЗМЕР</span><strong>ZIP / ${PL.formatSize(p.size)}</strong></div><div><span>ОПУБЛИКОВАН</span><strong>${PL.formatDate(p.createdAt)}</strong></div><div><span>СКАЧИВАНИЙ</span><strong>${p.downloads}</strong></div></div><div class="notice">${PL.icon('info')}<span>Распакуй архив и прочитай инструкцию автора перед установкой. Совместимость с конкретной версией FL Studio уточняй в описании.</span></div><a class="btn btn-orange full-width detail-download" href="${e(p.downloadUrl)}" data-download="${e(p.id)}" download>Скачать ZIP <span> ${PL.formatSize(p.size)}</span>${PL.icon('download')}</a>${state.admin ? `<div class="detail-admin"><button class="btn btn-outline" data-edit="${e(p.id)}">${PL.icon('edit')} Изменить</button><button class="btn btn-outline" data-delete="${e(p.id)}">${PL.icon('trash')} Удалить</button></div>` : ''}`;
  }
  function showDetail(id) {
    const p = state.plugins.find(item => item.id === id);
    if (!p) return;
    renderDetail(p); PL.openDialog('detail-dialog');
  }
  document.addEventListener('click', event => {
    const detail = event.target.closest('[data-detail]');
    if (detail) { showDetail(detail.dataset.detail); return; }
    const edit = event.target.closest('[data-edit]');
    if (edit && state.admin) { openUpload(edit.dataset.edit); return; }
    const remove = event.target.closest('[data-delete]');
    if (remove && state.admin) { openDelete(remove.dataset.delete); return; }
    if (event.target.closest('[data-download]')) setTimeout(() => { if (!uploading) loadCatalog(); }, 1600);
  });

  function setAccent(accent) {
    $('plugin-accent').value = accent;
    document.querySelectorAll('[data-accent]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.accent === accent)));
  }
  function updateFile(file) {
    selectedFile = file || null;
    $('dropzone').classList.toggle('has-file', !!file);
    $('drop-title').textContent = file ? file.name : 'Перетащи ZIP сюда';
    $('drop-hint').textContent = file ? `${PL.formatSize(file.size)} · Нажми, чтобы заменить` : `или нажми, чтобы выбрать файл · до ${Math.round(state.maxUploadBytes / 1024 / 1024)} МБ`;
    $('remove-file').hidden = !file;
    $('archive-input').required = !file && !state.editingId;
    $('upload-error').textContent = '';
  }
  function resetUploadForm() {
    $('upload-form').reset(); updateFile(null); setAccent('orange');
    $('upload-error').textContent = ''; $('upload-progress').hidden = true;
    $('upload-submit').disabled = false; $('upload-cancel').disabled = false;
    $('archive-input').disabled = false;
  }
  function openUpload(id = null) {
    if (!state.admin) { openLogin(); return; }
    if (uploading) return;
    resetUploadForm();
    state.editingId = id;
    const p = id ? state.plugins.find(item => item.id === id) : null;
    if (id && !p) return;
    $('archive-field').hidden = !!p;
    $('archive-input').required = !p;
    $('upload-title').textContent = p ? 'ОБНОВИ СВОЙ РЕЛИЗ.' : 'ДОБАВЬ СВОЙ ЗВУК.';
    $('upload-eyebrow').textContent = p ? 'РЕДАКТИРОВАНИЕ' : 'НОВЫЙ РЕЛИЗ';
    $('upload-intro').textContent = p ? 'Измени описание и оформление. Чтобы заменить сам ZIP-архив, удали этот релиз и загрузи новый.' : 'Загрузи ZIP-архив и расскажи, что внутри. После публикации он сразу появится в каталоге.';
    $('upload-submit').innerHTML = `${p ? 'Сохранить' : 'Опубликовать'} ${PL.icon(p ? 'check' : 'arrow-up-right')}`;
    if (p) {
      for (const key of ['title', 'category', 'version', 'description', 'author', 'tags']) {
        $(`plugin-${key}`).value = key === 'tags' ? p.tags.join(', ') : p[key];
      }
      document.querySelectorAll('input[name=compatibility]').forEach(input => { input.checked = p.compatibility.includes(input.value); });
      setAccent(p.accent);
    }
    PL.closeDialog('detail-dialog');
    PL.openDialog('upload-dialog');
    $('upload-dialog').scrollTop = 0;
  }
  $('add-plugin').addEventListener('click', () => openUpload());
  $('empty-action').addEventListener('click', () => openUpload());
  document.querySelectorAll('[data-accent]').forEach(button => button.addEventListener('click', () => setAccent(button.dataset.accent)));
  $('dropzone').addEventListener('click', event => { if (!uploading && event.target !== $('archive-input')) $('archive-input').click(); });
  $('dropzone').addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!uploading) $('archive-input').click(); } });
  $('archive-input').addEventListener('change', event => updateFile(event.target.files[0]));
  $('remove-file').addEventListener('click', () => { $('archive-input').value = ''; updateFile(null); $('dropzone').focus(); });
  ['dragenter', 'dragover'].forEach(type => $('dropzone').addEventListener(type, event => { event.preventDefault(); if (!uploading) $('dropzone').classList.add('dragover'); }));
  $('dropzone').addEventListener('dragleave', event => { if (!$('dropzone').contains(event.relatedTarget)) $('dropzone').classList.remove('dragover'); });
  $('dropzone').addEventListener('drop', event => {
    event.preventDefault(); $('dropzone').classList.remove('dragover');
    if (uploading) return;
    const file = event.dataTransfer.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.zip')) { $('upload-error').textContent = 'Нужен ZIP-архив с расширением .zip.'; return; }
    if (event.dataTransfer.files.length > 1) { $('upload-error').textContent = 'За один раз можно загрузить только один архив.'; return; }
    $('archive-input').value = ''; updateFile(file);
  });
  // Prevent the browser from navigating away when a file is dropped outside the target.
  window.addEventListener('dragover', event => { if (event.dataTransfer?.types.includes('Files')) event.preventDefault(); });
  window.addEventListener('drop', event => { if (event.dataTransfer?.types.includes('Files')) event.preventDefault(); });

  function uploadProgress(value) {
    $('progress-fill').style.width = `${value}%`;
    $('progress-value').textContent = `${value}%`;
    $('progress-track').setAttribute('aria-valuenow', String(value));
    if (value === 100) { $('upload-progress').classList.add('indeterminate'); $('progress-label').textContent = 'Сохраняем релиз…'; $('progress-value').textContent = ''; }
  }
  function finishUpload() {
    uploading = false; uploadRequest = null;
    $('upload-submit').disabled = false; $('upload-cancel').disabled = false;
    $('upload-progress').classList.remove('indeterminate');
  }
  $('upload-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (uploading || !state.admin) return;
    $('upload-error').textContent = '';
    if (!$('upload-form').reportValidity()) return;
    const form = new FormData($('upload-form'));
    const compatibility = form.getAll('compatibility');
    if (!compatibility.length) { $('upload-error').textContent = 'Выбери хотя бы одну операционную систему.'; return; }
    form.set('compatibility', JSON.stringify(compatibility));
    const tags = String(form.get('tags') || '').split(',').map(x => x.trim()).filter(Boolean);
    if (tags.length > 6 || tags.some(x => x.length > 24)) { $('upload-error').textContent = 'До 6 тегов, каждый не длиннее 24 символов.'; $('plugin-tags').focus(); return; }
    let url = '/api/plugins';
    let method = 'POST';
    if (state.editingId) {
      url += `/${encodeURIComponent(state.editingId)}`; method = 'PATCH';
      const body = Object.fromEntries(form.entries()); delete body.archive;
      await submitEdit(url, body); return;
    }
    if (!selectedFile) { $('upload-error').textContent = 'Выбери ZIP-архив.'; $('dropzone').focus(); return; }
    if (!selectedFile.name.toLowerCase().endsWith('.zip')) { $('upload-error').textContent = 'Нужен файл с расширением .zip.'; return; }
    if (selectedFile.size > state.maxUploadBytes) { $('upload-error').textContent = `Максимальный размер — ${Math.round(state.maxUploadBytes / 1024 / 1024)} МБ. Выбери архив поменьше.`; return; }
    if (selectedFile.size < 22) { $('upload-error').textContent = 'Архив повреждён или пуст. Выбери другой ZIP.'; return; }
    form.set('archive', selectedFile, selectedFile.name);
    uploading = true; $('upload-submit').disabled = true;
    $('upload-progress').hidden = false; $('progress-label').textContent = 'Загружаем архив…'; uploadProgress(0);
    const request = new XMLHttpRequest(); uploadRequest = request;
    request.open(method, url);
    request.setRequestHeader('Authorization', `Bearer ${sessionStorage.getItem('pluglab-token') || ''}`);
    request.upload.addEventListener('progress', progress => { if (progress.lengthComputable) uploadProgress(Math.min(100, Math.round(progress.loaded / progress.total * 100))); });
    request.addEventListener('load', async () => {
      let data; try { data = JSON.parse(request.responseText); } catch { data = {}; }
      const ok = request.status >= 200 && request.status < 300;
      finishUpload();
      if (!ok) {
        $('upload-error').textContent = data.error || 'Не удалось опубликовать плагин. Попробуйте ещё раз.';
        $('upload-progress').hidden = true;
        if (request.status === 401) handleAuthError({ status: 401 });
        return;
      }
      PL.closeDialog('upload-dialog'); resetUploadForm();
      PL.toast('Релиз в каталоге. Твой звук готов к скачиванию.');
      state.category = 'all'; state.query = ''; $('catalog-search').value = ''; syncURL();
      await loadCatalog();
    });
    request.addEventListener('error', () => { finishUpload(); $('upload-error').textContent = 'Связь прервалась. Проверьте подключение и попробуйте снова.'; $('upload-progress').hidden = true; });
    request.addEventListener('abort', () => { finishUpload(); $('upload-progress').hidden = true; });
    request.addEventListener('timeout', () => { finishUpload(); $('upload-error').textContent = 'Загрузка заняла слишком много времени. Попробуйте ещё раз.'; $('upload-progress').hidden = true; });
    request.timeout = 15 * 60 * 1000;
    request.send(form);
  });
  async function submitEdit(url, body) {
    uploading = true; $('upload-submit').disabled = true;
    try {
      await PL.api(url, { method: 'PATCH', body: JSON.stringify(body) });
      PL.closeDialog('upload-dialog'); resetUploadForm();
      PL.toast('Изменения сохранены.');
      await loadCatalog();
    } catch (err) { $('upload-error').textContent = err.message; handleAuthError(err); }
    finally { finishUpload(); }
  }
  $('upload-dialog').addEventListener('close', () => {
    if (uploadRequest && uploading) uploadRequest.abort();
  });
  $('login-dialog').addEventListener('close', () => { $('admin-password').value = ''; });

  function openDelete(id) {
    if (!state.admin) return;
    const p = state.plugins.find(item => item.id === id); if (!p) return;
    state.deletingId = id;
    $('delete-description').textContent = `«${p.title}» и архив ${p.originalName} будут удалены из библиотеки.`;
    $('delete-error').textContent = ''; $('confirm-delete').disabled = false;
    PL.openDialog('delete-dialog');
  }
  $('confirm-delete').addEventListener('click', async () => {
    if (!state.deletingId || !state.admin) return;
    $('confirm-delete').disabled = true; $('delete-error').textContent = '';
    try {
      await PL.api(`/api/plugins/${encodeURIComponent(state.deletingId)}`, { method: 'DELETE' });
      if (state.detailId === state.deletingId) PL.closeDialog('detail-dialog');
      PL.closeDialog('delete-dialog'); state.deletingId = null;
      PL.toast('Релиз удалён из библиотеки.'); await loadCatalog();
    } catch (err) { $('delete-error').textContent = err.message; handleAuthError(err); }
    finally { $('confirm-delete').disabled = false; }
  });

  async function init() {
    const token = sessionStorage.getItem('pluglab-token');
    if (token) {
      try { await PL.api('/api/session'); setAdmin(true); }
      catch { sessionStorage.removeItem('pluglab-token'); }
    }
    await loadCatalog();
    if (initialParams.get('admin') === '1' && !state.admin) openLogin();
  }
  init();
})();
