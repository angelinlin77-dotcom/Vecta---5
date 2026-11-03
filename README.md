# Milky Wash: Sistem Informasi Laundry
UTS Pengembangan Aplikasi berbasis Platform

Aplikasi web untuk mencatat pesanan laundry kiloan, data pelanggan, dan daftar layanan beserta tarifnya. Kasir bisa mencatat pembayaran DP atau lunas, memantau status cucian dari Diterima sampai Selesai, dan melihat riwayat transaksi setiap pelanggan.

## Teknologi
- **Backend:** Node.js, Express, SQLite (`base_server/`, template dari dosen)
- **Frontend:** React, TypeScript, Vite (`web/`)

## Struktur Folder
```
Vecta---5/
├── base_server/
│   ├── server.js
│   ├── database.sqlite
│   └── src/
│       ├── routes/laundryRoutes.js
│       ├── controllers/laundryController.js
│       ├── models/laundryModel.js
│       └── sql_scripts/init.sql
└── web/
    └── src/
        ├── App.tsx      (halaman Pesanan, Pelanggan, Layanan)
        ├── api.ts       (pemanggilan API dan format rupiah)
        └── types.ts     (tipe data)
```

## Perubahan pada base_server (selain file baru)
| File | Perubahan |
|---|---|
| `server.js` | +2 baris: `require` dan `app.use('/api', laundryRoutes)` |
| `src/sql_scripts/init.sql` | +tabel `pelanggan`, `layanan`, `pesanan` dan data awal |
| `src/routes/laundryRoutes.js`, `src/controllers/laundryController.js`, `src/models/laundryModel.js` | file baru, pola routes → controllers → models seperti template |

`/api/products` bawaan template tidak diubah.

## Menjalankan
```bash
# Terminal 1: API (port dari base_server/.env, mis. 5173)
cd base_server && npm install && npm start

# Terminal 2: Web di http://localhost:5174
cd web && npm install && npm run dev
```
Bila port API bukan 5173, salin `web/.env.example` menjadi `web/.env` dan ubah `VITE_API_URL` (lalu restart `npm run dev`).

## Fitur

### Pesanan (menu awal)
- Kartu ringkasan: total pesanan, total transaksi, pendapatan yang sudah dibayar, dan jumlah pesanan per status.
- Tambah dan edit pesanan: pilih pelanggan, layanan, berat (kg), dan catatan.
- Perkiraan total tampil otomatis, nilai final dihitung server.
- Pembayaran: bayar sekarang (sebagian atau penuh), pilih metode bayar, dan tombol **Lunasi sisa**.
- Validasi: pembayaran tidak boleh negatif, tidak boleh melebihi sisa tagihan, dan metode bayar wajib dipilih bila ada pembayaran.
- Ubah status pesanan langsung dari tabel.
- Cari berdasarkan kode atau nama pelanggan, filter berdasarkan status.
- Menampilkan sisa tagihan dan tanggal pelunasan.

### Pelanggan
- Kartu ringkasan: total pelanggan, aktif 30 hari terakhir, belum pernah transaksi, dan nomor WhatsApp tidak valid.
- Tambah dan edit pelanggan lewat panel samping.
- Validasi: nama wajib diisi, nomor WhatsApp 10 sampai 13 digit, dan nomor yang sama tidak boleh terdaftar dua kali.
- Riwayat transaksi setiap pelanggan.
- Cari berdasarkan nama atau nomor WhatsApp.
- Urutkan berdasarkan terakhir datang, nama, total belanja, atau jumlah pesanan.
- Tombol Hapus hanya muncul untuk pelanggan yang belum punya pesanan.

### Layanan & Tarif
- Tambah dan edit layanan: nama, harga per kg, estimasi pengerjaan (hari), dan deskripsi.
- Validasi: harga harus lebih dari 0 dan estimasi minimal 1 hari.
- Filter layanan: semua, sudah dipakai, dan belum dipakai.
- Peringatan saat harga diubah: harga baru hanya berlaku untuk pesanan baru.
- Tombol Hapus hanya muncul untuk layanan yang belum dipakai pesanan.

## Aturan Bisnis
- **Status pesanan:** Diterima → Dicuci → Disetrika → Siap Diambil → Selesai.
- **Status bayar:** Belum Bayar (belum ada pembayaran), DP (dibayar sebagian, ditampilkan sebagai "Belum Lunas"), dan Lunas.
- **Total harga** = berat × harga per kg, dihitung di server.
- **Kode pesanan** dibuat otomatis dengan format `LDR-0001`.
- Pelanggan atau layanan yang masih dipakai pesanan tidak bisa dihapus (server membalas `409`).

## Endpoint API
| Method | Endpoint | Keterangan |
|---|---|---|
| GET | `/api/pelanggan` | daftar pelanggan |
| GET | `/api/pelanggan/:id` | detail pelanggan |
| POST | `/api/pelanggan` | tambah pelanggan |
| PUT | `/api/pelanggan/:id` | ubah pelanggan |
| DELETE | `/api/pelanggan/:id` | hapus pelanggan (409 bila masih dipakai pesanan) |
| GET | `/api/layanan` | daftar layanan |
| GET | `/api/layanan/:id` | detail layanan |
| POST | `/api/layanan` | tambah layanan |
| PUT | `/api/layanan/:id` | ubah layanan |
| DELETE | `/api/layanan/:id` | hapus layanan (409 bila masih dipakai pesanan) |
| GET | `/api/pesanan?status=&pelanggan_id=&q=` | daftar pesanan dengan filter |
| GET | `/api/pesanan/:id` | detail pesanan |
| POST | `/api/pesanan` | tambah pesanan |
| PUT | `/api/pesanan/:id` | ubah pesanan atau tambah pembayaran |
| PATCH | `/api/pesanan/:id/status` | ubah status pesanan |
| DELETE | `/api/pesanan/:id` | hapus pesanan |
| GET | `/api/dashboard` | data ringkasan pesanan |

### Contoh: membuat pesanan dengan DP
```http
POST /api/pesanan
Content-Type: application/json

{
  "pelanggan_id": 1,
  "layanan_id": 2,
  "berat_kg": 3.5,
  "catatan": "Jas perlu hati-hati",
  "metode_bayar": "Tunai",
  "status_bayar": "DP",
  "jumlah_dibayar": 10000,
  "bayar_sekarang": 10000
}
```

### Contoh: mengubah status pesanan
```http
PATCH /api/pesanan/1/status
Content-Type: application/json

{ "status": "Dicuci" }
```
