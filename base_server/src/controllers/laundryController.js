const m = require('../models/laundryModel');

const STATUS = ['Diterima', 'Dicuci', 'Disetrika', 'Siap Diambil', 'Selesai'];

class HttpError extends Error {
  constructor(code, message, error) { super(message); this.code = code; this.error = error; }
}
const bad = (error) => new HttpError(400, 'Validasi gagal', error);
const notFound = (what) => new HttpError(404, `${what} tidak ditemukan`);

// Bungkus handler: hasilnya [kode, data, pesan]; HttpError jadi respons gagal.
const handle = (fn) => async (req, res) => {
  try {
    const [code, data, message] = await fn(req);
    res.status(code).json({ success: true, message, data });
  } catch (e) {
    if (e instanceof HttpError) return res.status(e.code).json({ success: false, message: e.message, error: e.error ?? e.message });
    console.error(e);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan server', error: e.message });
  }
};

const text = (v, field, required = true) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (required && !s) throw bad(`${field} wajib diisi`);
  return s;
};
const num = (v, field, { min = 0, int = false, gt = false } = {}) => {
  const n = Number(v);
  const ok = v !== '' && v !== null && v !== undefined && Number.isFinite(n) && (gt ? n > min : n >= min) && (!int || Number.isInteger(n));
  if (!ok) throw bad(`${field} harus berupa angka ${int ? 'bulat ' : ''}${gt ? '>' : '>='} ${min}`);
  return n;
};
const id = (req) => num(req.params.id, 'id', { min: 1, int: true });

const parse = {
  pelanggan: (b) => ({ nama: text(b.nama, 'nama'), telepon: text(b.telepon, 'telepon'), alamat: text(b.alamat, 'alamat', false) }),
  layanan: (b) => ({
    nama: text(b.nama, 'nama'),
    harga_per_kg: num(b.harga_per_kg, 'harga_per_kg', { int: true }),
    estimasi_hari: num(b.estimasi_hari, 'estimasi_hari', { int: true }),
    deskripsi: text(b.deskripsi, 'deskripsi', false),
  }),
};
const labels = { pelanggan: 'Pelanggan', layanan: 'Layanan' };

// Pelanggan dan Layanan memakai CRUD yang sama, hanya beda tabel.
const crud = (name) => ({
  list: handle(async (req) => [200, await m.findAll(name, req.query.q), `Daftar ${name}`]),
  get: handle(async (req) => {
    const row = await m.findById(name, id(req));
    if (!row) throw notFound(labels[name]);
    return [200, row, `Detail ${name}`];
  }),
  create: handle(async (req) => [201, await m.create(name, parse[name](req.body)), `${labels[name]} dibuat`]),
  update: handle(async (req) => {
    const i = id(req);
    const row = parse[name](req.body);
    if (!(await m.findById(name, i))) throw notFound(labels[name]);
    return [200, await m.update(name, i, row), `${labels[name]} diperbarui`];
  }),
  remove: handle(async (req) => {
    const i = id(req);
    if (!(await m.findById(name, i))) throw notFound(labels[name]);
    if (await m.countPesananUsing(name, i)) throw new HttpError(409, 'Tidak dapat dihapus', `${labels[name]} masih dipakai oleh pesanan`);
    await m.remove(name, i);
    return [200, null, `${labels[name]} dihapus`];
  }),
});

/* Pesanan: total_harga dihitung server dari berat x harga layanan */
const pesananBody = async (b) => {
  const pelanggan_id = num(b.pelanggan_id, 'pelanggan_id', { min: 1, int: true });
  const layanan_id = num(b.layanan_id, 'layanan_id', { min: 1, int: true });
  const berat_kg = num(b.berat_kg, 'berat_kg', { gt: true });
  const status = b.status ?? 'Diterima';
  if (!STATUS.includes(status)) throw bad(`status harus salah satu dari: ${STATUS.join(', ')}`);
  if (!(await m.findById('pelanggan', pelanggan_id))) throw bad('pelanggan_id tidak ditemukan');
  const lay = await m.findById('layanan', layanan_id);
  if (!lay) throw bad('layanan_id tidak ditemukan');
  return {
    pelanggan_id, layanan_id, berat_kg, status,
    total_harga: Math.round(berat_kg * lay.harga_per_kg),
    tanggal_masuk: text(b.tanggal_masuk, 'tanggal_masuk', false) || new Date().toISOString().slice(0, 10),
    catatan: text(b.catatan, 'catatan', false),
  };
};

const pesanan = {
  list: handle(async (req) => [200, await m.findAllPesanan(req.query), 'Daftar pesanan']),
  get: handle(async (req) => {
    const row = await m.findPesananById(id(req));
    if (!row) throw notFound('Pesanan');
    return [200, row, 'Detail pesanan'];
  }),
  create: handle(async (req) => [201, await m.createPesanan(await pesananBody(req.body)), 'Pesanan dibuat']),
  update: handle(async (req) => {
    const i = id(req);
    const row = await pesananBody(req.body);
    if (!(await m.findPesananById(i))) throw notFound('Pesanan');
    return [200, await m.updatePesanan(i, row), 'Pesanan diperbarui'];
  }),
  setStatus: handle(async (req) => {
    const i = id(req);
    const { status } = req.body ?? {};
    if (!STATUS.includes(status)) throw bad(`status harus salah satu dari: ${STATUS.join(', ')}`);
    if (!(await m.findPesananById(i))) throw notFound('Pesanan');
    return [200, await m.updateStatus(i, status), 'Status diperbarui'];
  }),
  remove: handle(async (req) => {
    if (!(await m.deletePesanan(id(req)))) throw notFound('Pesanan');
    return [200, null, 'Pesanan dihapus'];
  }),
};

const dashboard = handle(async () => [200, await m.dashboard(), 'Ringkasan']);

module.exports = { pelanggan: crud('pelanggan'), layanan: crud('layanan'), pesanan, dashboard };
