const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');

async function main() {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const password = await rl.question('Новый пароль автора (минимум 8 символов): ');
    if (password.length < 8 || password.length > 256) throw new Error('Пароль должен содержать от 8 до 256 символов.');
    const confirm = await rl.question('Повторите пароль: ');
    if (password !== confirm) throw new Error('Пароли не совпадают.');
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    const file = path.join(__dirname, '..', 'data', 'auth.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify({ salt, hash }, null, 2), { mode: 0o600 });
    fs.renameSync(temp, file);
    console.log('Пароль изменён. Перезапустите сервер. Если задан ADMIN_PASSWORD, удалите эту переменную: она имеет приоритет.');
  } finally { rl.close(); }
}
main().catch(err => { console.error(err.message); process.exitCode = 1; });
