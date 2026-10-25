const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = path.resolve(__dirname, '../../database.sqlite');
const initSQL = fs.readFileSync(
  path.join(__dirname, '../sql_scripts/init.sql'),
  'utf8'
);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Gagal konek SQLite:', err.message);
    process.exit(1);
  }
  console.log('✅ Terhubung ke SQLite:', dbPath);
});

const run = (sql) =>
  new Promise((resolve, reject) =>
    db.run(sql, (err) => (err ? reject(err) : resolve()))
  );

const all = (sql) =>
  new Promise((resolve, reject) =>
    db.all(sql, (err, rows) => (err ? reject(err) : resolve(rows)))
  );

const initializeDatabase = async () => {
  // 1. Buat tabel dari init.sql (seperti sebelumnya)
  await new Promise((resolve, reject) => {
    db.exec(initSQL, (err) => (err ? reject(err) : resolve()));
  });

  // 2. Tambah kolom pembayaran kalau belum ada
  const cols = await all('PRAGMA table_info(pesanan)');
  const ada = (nama) => cols.some((c) => c.name === nama);

  if (!ada('status_bayar'))
    await run("ALTER TABLE pesanan ADD COLUMN status_bayar TEXT NOT NULL DEFAULT 'Belum Bayar'");
  if (!ada('metode_bayar'))
    await run("ALTER TABLE pesanan ADD COLUMN metode_bayar TEXT NOT NULL DEFAULT ''");
  if (!ada('jumlah_dibayar'))
    await run('ALTER TABLE pesanan ADD COLUMN jumlah_dibayar INTEGER NOT NULL DEFAULT 0');
};


module.exports = { db, initializeDatabase };