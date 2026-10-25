CREATE TABLE IF NOT EXISTS test_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO test_logs DEFAULT VALUES;

CREATE TABLE IF NOT EXISTS products (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT    NOT NULL,
      price         REAL    NOT NULL,
      stock         INTEGER DEFAULT 0,
      category      TEXT,
      description   TEXT,
      is_available  INTEGER DEFAULT 1,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );

-- ===== Domain Laundry =====
CREATE TABLE IF NOT EXISTS pelanggan (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  nama    TEXT NOT NULL,
  telepon TEXT NOT NULL,
  alamat  TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS layanan (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nama          TEXT NOT NULL,
  harga_per_kg  INTEGER NOT NULL,
  estimasi_hari INTEGER NOT NULL,
  deskripsi     TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS pesanan (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  kode           TEXT NOT NULL DEFAULT '',
  pelanggan_id   INTEGER NOT NULL REFERENCES pelanggan(id),
  layanan_id     INTEGER NOT NULL REFERENCES layanan(id),
  berat_kg       REAL NOT NULL,
  total_harga    INTEGER NOT NULL,
  status         TEXT NOT NULL DEFAULT 'Diterima',
  status_bayar   TEXT NOT NULL DEFAULT 'Belum Bayar',
  metode_bayar   TEXT NOT NULL DEFAULT '',
  jumlah_dibayar INTEGER NOT NULL DEFAULT 0,
  tanggal_masuk  TEXT NOT NULL DEFAULT (date('now')),
  catatan        TEXT DEFAULT ''
);

-- Data awal: hanya diisi saat tabel masih kosong
INSERT INTO pelanggan (nama, telepon, alamat)
SELECT * FROM (
  SELECT 'Budi Santoso', '081234567801', 'Jl. Gatot Subroto No. 12, Medan'
  UNION ALL SELECT 'Siti Aminah', '081234567802', 'Jl. Sisingamangaraja No. 45, Medan'
  UNION ALL SELECT 'Rudi Hartono', '081234567803', 'Jl. Setia Budi No. 7, Medan'
) WHERE NOT EXISTS (SELECT 1 FROM pelanggan);

INSERT INTO layanan (nama, harga_per_kg, estimasi_hari, deskripsi)
SELECT * FROM (
  SELECT 'Cuci Kering', 6000, 2, 'Cuci dan keringkan, tanpa setrika'
  UNION ALL SELECT 'Cuci Setrika', 8000, 3, 'Cuci, keringkan, dan setrika rapi'
  UNION ALL SELECT 'Setrika Saja', 5000, 1, 'Setrika pakaian bersih'
  UNION ALL SELECT 'Express 6 Jam', 15000, 1, 'Cuci setrika selesai di hari yang sama'
) WHERE NOT EXISTS (SELECT 1 FROM layanan);

INSERT INTO pesanan (kode, pelanggan_id, layanan_id, berat_kg, total_harga, status, tanggal_masuk, catatan)
SELECT * FROM (
  SELECT 'LDR-0001', 1, 2, 3.5, 28000, 'Dicuci', '2026-10-20', 'Pisahkan baju putih'
  UNION ALL SELECT 'LDR-0002', 2, 1, 5, 30000, 'Selesai', '2026-10-18', ''
  UNION ALL SELECT 'LDR-0003', 3, 4, 2, 30000, 'Diterima', '2026-10-24', 'Jas perlu hati-hati'
) WHERE NOT EXISTS (SELECT 1 FROM pesanan);

