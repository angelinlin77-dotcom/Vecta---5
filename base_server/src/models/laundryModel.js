const { dbRun, dbGet, dbAll } = require('../middlewares_helpers/sqlite3_helpers');

// Nama tabel dan kolom hanya berasal dari konstanta ini, tidak pernah dari input pengguna.
const TABLES = {
  pelanggan: { cols: ['nama', 'telepon', 'alamat'], usedBy: 'pelanggan_id' },
  layanan: { cols: ['nama', 'harga_per_kg', 'estimasi_hari', 'deskripsi'], usedBy: 'layanan_id' },
};
const PESANAN_COLS = ['pelanggan_id', 'layanan_id', 'berat_kg', 'total_harga', 'status', 'tanggal_masuk', 'catatan'];
const PESANAN_SQL = `
  SELECT p.*, c.nama AS pelanggan_nama, l.nama AS layanan_nama
  FROM pesanan p
  JOIN pelanggan c ON c.id = p.pelanggan_id
  JOIN layanan l ON l.id = p.layanan_id`;

const table = (name) => {
  if (!TABLES[name]) throw new Error(`Tabel tidak dikenal: ${name}`);
  return TABLES[name];
};

/* =============== Pelanggan dan Layanan =============== */
const findAll = (name, q = '') => {
  table(name);
  return dbAll(`SELECT * FROM ${name} WHERE LOWER(nama) LIKE ? ORDER BY id`, [`%${String(q).toLowerCase()}%`]);
};

const findById = (name, id) => {
  table(name);
  return dbGet(`SELECT * FROM ${name} WHERE id = ?`, [id]);
};

const create = async (name, row) => {
  const { cols } = table(name);
  const { lastID } = await dbRun(
    `INSERT INTO ${name} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    cols.map((c) => row[c]),
  );
  return findById(name, lastID);
};

const update = async (name, id, row) => {
  const { cols } = table(name);
  await dbRun(`UPDATE ${name} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...cols.map((c) => row[c]), id]);
  return findById(name, id);
};

const remove = async (name, id) => {
  table(name);
  const { changes } = await dbRun(`DELETE FROM ${name} WHERE id = ?`, [id]);
  return changes > 0;
};

// Jumlah pesanan yang masih memakai pelanggan atau layanan ini.
const countPesananUsing = async (name, id) => {
  const { usedBy } = table(name);
  const row = await dbGet(`SELECT COUNT(*) AS n FROM pesanan WHERE ${usedBy} = ?`, [id]);
  return row.n;
};

/* =============== Pesanan =============== */
const findAllPesanan = ({ status, pelanggan_id, q } = {}) => {
  const where = [];
  const args = [];
  if (status) { where.push('p.status = ?'); args.push(status); }
  if (pelanggan_id) { where.push('p.pelanggan_id = ?'); args.push(Number(pelanggan_id)); }
  if (q) {
    const like = `%${String(q).toLowerCase()}%`;
    where.push('(LOWER(p.kode) LIKE ? OR LOWER(c.nama) LIKE ?)');
    args.push(like, like);
  }
  return dbAll(`${PESANAN_SQL} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.id DESC`, args);
};

const findPesananById = (id) => dbGet(`${PESANAN_SQL} WHERE p.id = ?`, [id]);

const createPesanan = async (row) => {
  const { lastID } = await dbRun(
    `INSERT INTO pesanan (${PESANAN_COLS.join(', ')}) VALUES (${PESANAN_COLS.map(() => '?').join(', ')})`,
    PESANAN_COLS.map((c) => row[c]),
  );
  await dbRun('UPDATE pesanan SET kode = ? WHERE id = ?', [`LDR-${String(lastID).padStart(4, '0')}`, lastID]);
  return findPesananById(lastID);
};

const updatePesanan = async (id, row) => {
  await dbRun(`UPDATE pesanan SET ${PESANAN_COLS.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...PESANAN_COLS.map((c) => row[c]), id]);
  return findPesananById(id);
};

const updateStatus = async (id, status) => {
  await dbRun('UPDATE pesanan SET status = ? WHERE id = ?', [status, id]);
  return findPesananById(id);
};

const deletePesanan = async (id) => {
  const { changes } = await dbRun('DELETE FROM pesanan WHERE id = ?', [id]);
  return changes > 0;
};

const dashboard = async () => {
  const total = await dbGet('SELECT COUNT(*) AS n, COALESCE(SUM(total_harga), 0) AS t FROM pesanan');
  const perStatus = await dbAll('SELECT status, COUNT(*) AS n FROM pesanan GROUP BY status');
  return { total_pesanan: total.n, total_pendapatan: total.t, per_status: Object.fromEntries(perStatus.map((r) => [r.status, r.n])) };
};

module.exports = {
  findAll, findById, create, update, remove, countPesananUsing,
  findAllPesanan, findPesananById, createPesanan, updatePesanan, updateStatus, deletePesanan, dashboard,
};
