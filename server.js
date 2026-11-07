const express = require('express');
const multer = require('multer');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const UPLOADS = path.join(ROOT, 'uploads');
const TEMP = path.join(UPLOADS, '.tmp');
const DB_FILE = path.join(DATA, 'plugins.json');
const AUTH_FILE = path.join(DATA, 'auth.json');
const MAX_UPLOAD_BYTES = Math.max(1, Math.min(1024, Number(process.env.MAX_UPLOAD_MB || 100))) * 1024 * 1024;
const CATEGORIES = ['effects', 'instruments', 'presets', 'drumkits', 'projects', 'other'];
const ACCENTS = ['orange', 'lime', 'blue', 'silver'];
const sessions = new Map();
const loginAttempts = new Map();
const SESSION_TTL = 8 * 60 * 60 * 1000;

for (const dir of [DATA, UPLOADS, TEMP]) fs.mkdirSync(dir, { recursive: true });
for (const name of fs.readdirSync(TEMP)) fs.rmSync(path.join(TEMP, name), { force: true });

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw new Error(`Cannot read ${path.basename(file)}: ${err.message}`);
  }
}
function atomicJSON(file, value) {
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(temp, file);
}

let auth;
if (process.env.ADMIN_PASSWORD) {
  if (process.env.ADMIN_PASSWORD.length < 8) throw new Error('ADMIN_PASSWORD must contain at least 8 characters.');
  const salt = crypto.randomBytes(16).toString('hex');
  auth = { salt, hash: crypto.scryptSync(process.env.ADMIN_PASSWORD, salt, 64).toString('hex') };
} else if (fs.existsSync(AUTH_FILE)) {
  auth = readJSON(AUTH_FILE, null);
  if (!auth?.salt || !auth?.hash) throw new Error('Invalid data/auth.json. Restore it from a backup.');
} else {
  const password = crypto.randomBytes(12).toString('base64url');
  const salt = crypto.randomBytes(16).toString('hex');
  auth = { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') };
  atomicJSON(AUTH_FILE, auth);
  fs.writeFileSync(path.join(ROOT, 'ADMIN.txt'), `PLUGLAB — доступ автора\n\nАдрес входа: /catalog → «Вход для автора»\nПароль: ${password}\n\nНе публикуйте этот файл и не добавляйте его в публичный репозиторий.\nДля смены пароля остановите сервер и выполните: node scripts/set-password.js\nНа постоянном хостинге можно задать переменную окружения ADMIN_PASSWORD.\n`, { mode: 0o600 });
  console.log('Admin password generated. Read ADMIN.txt in the project root (never public).');
}

let database = readJSON(DB_FILE, { plugins: [] });
if (!Array.isArray(database.plugins)) throw new Error('Invalid data/plugins.json: plugins must be an array.');
function saveDB() { atomicJSON(DB_FILE, database); }
function cleanTemp(file) { if (file) fs.rmSync(file.path, { force: true }); }
function publicPlugin(p) {
  const { storedName, ...safe } = p;
  return { ...safe, downloadUrl: `/api/plugins/${p.id}/download` };
}
function tokenFrom(req) {
  const value = req.get('authorization') || '';
  return value.startsWith('Bearer ') ? value.slice(7) : '';
}
function getSession(req) {
  const token = tokenFrom(req);
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const key = crypto.createHash('sha256').update(token).digest('hex');
  const session = sessions.get(key);
  if (!session || session.expires < Date.now()) { sessions.delete(key); return null; }
  return { key, session };
}
function requireAdmin(req, res, next) {
  if (!getSession(req)) return res.status(401).json({ error: 'Войдите как автор, чтобы продолжить.' });
  next();
}

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'",
    'Cache-Control': 'no-cache'
  });
  next();
});
app.use(express.json({ limit: '32kb' }));

// Uploads are never exposed as static files. Only validated records can be downloaded.
app.use(express.static(path.join(ROOT, 'public'), { index: 'index.html', dotfiles: 'deny' }));
app.get(['/', '/catalog'], (req, res) => {
  res.sendFile(path.join(ROOT, 'public', req.path === '/catalog' ? 'catalog.html' : 'index.html'));
});

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/catalog', (req, res) => {
  const plugins = database.plugins.map(publicPlugin);
  res.json({
    plugins,
    stats: { plugins: plugins.length, downloads: plugins.reduce((sum, p) => sum + p.downloads, 0) },
    maxUploadBytes: MAX_UPLOAD_BYTES
  });
});
app.get('/api/session', requireAdmin, (req, res) => {
  res.json({ admin: true, expires: getSession(req).session.expires });
});
app.post('/api/login', (req, res) => {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  let attempt = loginAttempts.get(ip);
  if (!attempt || attempt.reset < now) { attempt = { count: 0, reset: now + 15 * 60 * 1000 }; loginAttempts.set(ip, attempt); }
  if (attempt.count >= 10) return res.status(429).json({ error: 'Слишком много попыток. Попробуйте через 15 минут.' });
  attempt.count++;
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (password.length > 256) return res.status(400).json({ error: 'Неверный пароль.' });
  const candidate = crypto.scryptSync(password, auth.salt, 64);
  const expected = Buffer.from(auth.hash, 'hex');
  if (expected.length !== 64 || !crypto.timingSafeEqual(candidate, expected)) {
    return res.status(401).json({ error: 'Неверный пароль. Попробуйте ещё раз.' });
  }
  attempt.count = 0;
  const token = crypto.randomBytes(32).toString('hex');
  const expires = now + SESSION_TTL;
  sessions.set(crypto.createHash('sha256').update(token).digest('hex'), { expires });
  res.json({ token, expires });
});
app.post('/api/logout', requireAdmin, (req, res) => {
  sessions.delete(getSession(req).key);
  res.json({ ok: true });
});

const upload = multer({
  defParamCharset: 'utf8',
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, TEMP),
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}.part`)
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 12, fieldSize: 16384 },
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== '.zip') return cb(new Error('Нужен именно ZIP-архив с расширением .zip.'));
    cb(null, true);
  }
});
function archiveUpload(req, res, next) {
  upload.single('archive')(req, res, err => {
    if (!err) return next();
    cleanTemp(req.file);
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? `Архив слишком большой. Максимум — ${MAX_UPLOAD_BYTES / 1024 / 1024} МБ.`
      : err.code === 'LIMIT_UNEXPECTED_FILE' ? 'Можно прикрепить только один ZIP-архив.'
      : err.message || 'Не удалось загрузить архив.';
    res.status(400).json({ error: message });
  });
}
function validateZip(file) {
  if (!file || file.size < 22) return 'Выберите ZIP-архив. Поле обязательно.';
  const fd = fs.openSync(file.path, 'r');
  const header = Buffer.alloc(4);
  try { fs.readSync(fd, header, 0, 4, 0); } finally { fs.closeSync(fd); }
  if (!['504b0304', '504b0506', '504b0708'].includes(header.toString('hex'))) return 'Этот файл не является ZIP-архивом. Не переименовывайте другие форматы в .zip.';
  return null;
}
function metadata(body) {
  const field = (key, max, required = false) => {
    const value = typeof body[key] === 'string' ? body[key].trim() : '';
    if (required && !value) throw new Error(`Заполните поле «${key === 'title' ? 'Название' : 'Описание'}».`);
    if (value.length > max) throw new Error(`Поле «${key}» слишком длинное.`);
    return value;
  };
  const title = field('title', 80, true);
  const description = field('description', 2400, true);
  const category = field('category', 30, true);
  if (!CATEGORIES.includes(category)) throw new Error('Выберите категорию из списка.');
  const version = field('version', 24) || '1.0';
  const author = field('author', 60) || 'PLUGLAB';
  const accent = field('accent', 20) || 'orange';
  if (!ACCENTS.includes(accent)) throw new Error('Выберите оформление из списка.');
  let compatibility = body.compatibility;
  if (typeof compatibility === 'string') {
    try { compatibility = JSON.parse(compatibility); } catch { compatibility = compatibility.split(','); }
  }
  if (!Array.isArray(compatibility) || !compatibility.length || compatibility.some(x => !['Windows', 'macOS'].includes(x))) {
    throw new Error('Укажите совместимость: Windows и/или macOS.');
  }
  compatibility = [...new Set(compatibility)];
  const tags = field('tags', 180).split(',').map(x => x.trim()).filter(Boolean);
  if (tags.length > 6) throw new Error('Можно указать не больше 6 тегов.');
  if (tags.some(x => x.length > 24)) throw new Error('Каждый тег — не длиннее 24 символов.');
  return { title, description, category, version, author, accent, compatibility, tags };
}

app.post('/api/plugins', requireAdmin, archiveUpload, (req, res) => {
  try {
    const zipError = validateZip(req.file);
    if (zipError) { cleanTemp(req.file); return res.status(400).json({ error: zipError }); }
    const meta = metadata(req.body);
    const id = crypto.randomUUID();
    const storedName = `${id}.zip`;
    const now = new Date().toISOString();
    const originalName = path.basename(req.file.originalname).replace(/[\x00-\x1f<>:"/\\|?*]/g, '_').slice(0, 160);
    fs.renameSync(req.file.path, path.join(UPLOADS, storedName));
    const plugin = { id, ...meta, originalName, storedName, size: req.file.size, downloads: 0, createdAt: now, updatedAt: now };
    database.plugins.unshift(plugin);
    try { saveDB(); } catch (err) {
      database.plugins = database.plugins.filter(p => p.id !== id);
      fs.rmSync(path.join(UPLOADS, storedName), { force: true });
      throw err;
    }
    res.status(201).json({ plugin: publicPlugin(plugin) });
  } catch (err) {
    cleanTemp(req.file);
    res.status(err.message.startsWith('Заполните') || err.message.startsWith('Выберите') || err.message.startsWith('Укажите') || err.message.includes('тег') || err.message.includes('длинн') ? 400 : 500).json({ error: err.status ? err.message : (err.message.includes('архив') || err.message.includes('Заполните') || err.message.includes('Выберите') || err.message.includes('Укажите') || err.message.includes('тег') || err.message.includes('длинн') ? err.message : 'Не удалось сохранить плагин. Попробуйте ещё раз.') });
  }
});

app.patch('/api/plugins/:id', requireAdmin, (req, res) => {
  const plugin = database.plugins.find(p => p.id === req.params.id);
  if (!plugin) return res.status(404).json({ error: 'Плагин не найден.' });
  try {
    const meta = metadata({ ...plugin, ...req.body, compatibility: req.body.compatibility ?? plugin.compatibility });
    const updated = { ...plugin, ...meta, updatedAt: new Date().toISOString() };
    const index = database.plugins.indexOf(plugin);
    database.plugins[index] = updated;
    try { saveDB(); } catch (err) { database.plugins[index] = plugin; throw err; }
    res.json({ plugin: publicPlugin(updated) });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Не удалось сохранить изменения.' });
  }
});
app.delete('/api/plugins/:id', requireAdmin, (req, res) => {
  const index = database.plugins.findIndex(p => p.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: 'Плагин не найден.' });
  const [removed] = database.plugins.splice(index, 1);
  try { saveDB(); } catch (err) { database.plugins.splice(index, 0, removed); return res.status(500).json({ error: 'Не удалось удалить запись.' }); }
  fs.rmSync(path.join(UPLOADS, removed.storedName), { force: true });
  res.json({ ok: true });
});
app.get('/api/plugins/:id/download', (req, res) => {
  const plugin = database.plugins.find(p => p.id === req.params.id);
  if (!plugin) return res.status(404).json({ error: 'Плагин не найден.' });
  const file = path.join(UPLOADS, plugin.storedName);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Файл недоступен. Сообщите автору.' });
  plugin.downloads++;
  try { saveDB(); } catch { plugin.downloads--; return res.status(500).json({ error: 'Не удалось начать скачивание.' }); }
  res.set({ 'Content-Type': 'application/zip', 'X-Content-Type-Options': 'nosniff' });
  res.download(file, plugin.originalName, err => {
    if (err && !res.headersSent) res.status(500).json({ error: 'Не удалось скачать архив.' });
  });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Такого API-метода нет.' }));
app.use((req, res) => res.status(404).sendFile(path.join(ROOT, 'public', '404.html')));
app.use((err, req, res, next) => {
  cleanTemp(req.file);
  console.error(err.message);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.status === 400 ? 'Некорректный запрос.' : 'Ошибка сервера. Попробуйте ещё раз.' });
});

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, value] of sessions) if (value.expires < now) sessions.delete(key);
  for (const [key, value] of loginAttempts) if (value.reset < now) loginAttempts.delete(key);
}, 60 * 1000);
cleanupTimer.unref();
const server = app.listen(PORT, '0.0.0.0', () => console.log(`PLUGLAB is ready on http://0.0.0.0:${PORT}`));
server.requestTimeout = 15 * 60 * 1000;
server.headersTimeout = 65 * 1000;
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
