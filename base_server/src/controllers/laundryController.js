const m = require('../models/laundryModel');

const STATUS = ['Diterima', 'Dicuci', 'Disetrika', 'Siap Diambil', 'Selesai'];
const STATUS_BAYAR = ['Belum Bayar', 'DP', 'Lunas'];
const METODE_BAYAR = ['Tunai', 'Transfer', 'QRIS'];

class HttpError extends Error {
  constructor(code, message, error) { super(message); this.code = code; this.error = error; }
}
const bad = (error) => new HttpError(400, 'Validasi gagal', error);
const notFound = (what) => new HttpError(404, `${what} tidak ditemukan`);

// Tanggal hari ini (YYYY-MM-DD) menurut jam komputer server
const hariIni = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

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

/*
  Pesanan: total_harga dihitung server dari berat x harga layanan.

  Pembayaran bersifat BERTAHAP:
  - jumlah_dibayar di database = total yang SUDAH dibayar (akumulasi).
  - Nilai yang dikirim dari form ("Bayar sekarang") dianggap pembayaran BARU
    (field `bayar_sekarang`, atau `jumlah_dibayar` sebagai cadangan) dan
    DITAMBAHKAN ke pembayaran sebelumnya, bukan menimpa.
  - status_bayar dihitung otomatis oleh server.
  - Jika status_bayar = 'Lunas' dikirim, server membayar seluruh sisa tagihan.
  - tanggal_pelunasan (tampil sebagai "Tgl Bayar") = tanggal pembayaran terakhir.
    Diisi tanggal hari ini setiap ada pembayaran baru (lunas maupun belum lunas),
    tidak berubah kalau disimpan tanpa pembayaran baru.

  `existing` = data pesanan lama saat update (null saat create).
*/
const pesananBody = async (b, existing = null) => {
  const pelanggan_id = num(b.pelanggan_id, 'pelanggan_id', { min: 1, int: true });
  const layanan_id = num(b.layanan_id, 'layanan_id', { min: 1, int: true });
  const berat_kg = num(b.berat_kg, 'berat_kg', { gt: true });
  const status = b.status ?? existing?.status ?? 'Diterima';
  if (!STATUS.includes(status)) throw bad(`status harus salah satu dari: ${STATUS.join(', ')}`);
  if (!(await m.findById('pelanggan', pelanggan_id))) throw bad('pelanggan_id tidak ditemukan');
  const lay = await m.findById('layanan', layanan_id);
  if (!lay) throw bad('layanan_id tidak ditemukan');

  const total_harga = Math.round(berat_kg * lay.harga_per_kg);

  // ---- Pembayaran ----
  const dibayar_sebelumnya = Math.min(Number(existing?.jumlah_dibayar) || 0, total_harga);
  const sisa_saat_ini = total_harga - dibayar_sebelumnya;

  if (b.status_bayar !== undefined && !STATUS_BAYAR.includes(b.status_bayar)) {
    throw bad(`status_bayar harus salah satu dari: ${STATUS_BAYAR.join(', ')}`);
  }

  // Berapa yang dibayar SEKARANG
  let bayar_sekarang = 0;
  if (b.status_bayar === 'Lunas') {
    bayar_sekarang = sisa_saat_ini; // lunasi seluruh sisa
  } else {
    const raw = b.bayar_sekarang ?? b.jumlah_dibayar;
    const kosong = raw === undefined || raw === null || raw === '';
    if (!kosong) bayar_sekarang = num(raw, 'bayar_sekarang', { min: 0, int: true });
  }
  if (bayar_sekarang > sisa_saat_ini) {
    throw bad(`pembayaran (${bayar_sekarang}) melebihi sisa tagihan (${sisa_saat_ini})`);
  }

  // Metode bayar: wajib kalau ada pembayaran baru, kalau tidak pakai yang lama
  let metode_bayar = existing?.metode_bayar ?? '';
  if (bayar_sekarang > 0) {
    metode_bayar = text(b.metode_bayar, 'metode_bayar');
    if (!METODE_BAYAR.includes(metode_bayar)) throw bad(`metode_bayar harus salah satu dari: ${METODE_BAYAR.join(', ')}`);
  }

  const jumlah_dibayar = dibayar_sebelumnya + bayar_sekarang;
  const sisa_tagihan = total_harga - jumlah_dibayar;
  const status_bayar = sisa_tagihan === 0 && total_harga > 0 ? 'Lunas' : jumlah_dibayar > 0 ? 'DP' : 'Belum Bayar';
  if (status_bayar === 'Belum Bayar') metode_bayar = '';

  // Tanggal bayar: hari ini kalau ada pembayaran baru, kalau tidak pertahankan yang lama
  let tanggal_pelunasan = existing?.tanggal_pelunasan ?? null;
  if (bayar_sekarang > 0) tanggal_pelunasan = hariIni();
  if (status_bayar === 'Belum Bayar') tanggal_pelunasan = null;

  return {
    pelanggan_id, layanan_id, berat_kg, status,
    total_harga,
    status_bayar, metode_bayar, jumlah_dibayar, tanggal_pelunasan,
    tanggal_masuk: text(b.tanggal_masuk, 'tanggal_masuk', false) || existing?.tanggal_masuk || hariIni(),
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
    const existing = await m.findPesananById(i);
    if (!existing) throw notFound('Pesanan');
    const row = await pesananBody(req.body, existing);
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