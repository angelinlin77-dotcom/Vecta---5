# Milky Wash: Sistem Informasi Laundry

UTS Pengembangan Aplikasi Berbasis Platform | Kelompok Vecta-5

Aplikasi web untuk mencatat pesanan laundry kiloan, data pelanggan, dan daftar layanan beserta tarifnya. Kasir bisa mencatat pembayaran DP atau lunas, memantau status cucian dari Diterima sampai Selesai, dan melihat riwayat transaksi setiap pelanggan.

## Teknologi

- **Backend:** Node.js, Express, SQLite (`base_server/`, template dari dosen)
- **Frontend:** React, TypeScript, Vite (`web/`)

## Prasyarat

- Node.js versi 18 atau lebih baru (disarankan versi LTS)
- npm (sudah termasuk bersama Node.js)
- Git

## Struktur Folder

```
Vecta---5/
├── base_server/
│   ├── .env                      (konfigurasi port API)
│   ├── server.js
│   ├── database.sqlite           (dibuat otomatis, tidak di-commit)
│   └── src/
│       ├── routes/laundryRoutes.js
│       ├── controllers/laundryController.js
│       ├── models/laundryModel.js
│       └── sql_scripts/init.sql
└── web/
    ├── .env.example              (contoh konfigurasi alamat API)
    └── src/
        ├── App.tsx               (halaman Pesanan, Pelanggan, Layanan)
        ├── api.ts                (pemanggilan API dan format rupiah)
        └── types.ts              (tipe data)
```

## Perubahan pada base_server (selain file baru)

| File | Perubahan |
|---|---|
| `server.js` | +2 baris: `require` dan `app.use('/api', laundryRoutes)` |
| `src/sql_scripts/init.sql` | +tabel `pelanggan`, `layanan`, `pesanan` dan data awal |
| `src/routes/laundryRoutes.js`, `src/controllers/laundryController.js`, `src/models/laundryModel.js` | file baru, pola routes → controllers → models seperti template |

`/api/products` bawaan template tidak diubah.

## Menjalankan

Jalankan dua terminal secara bersamaan.

```bash
# Terminal 1: API
cd base_server
npm install
npm start

# Terminal 2: Web (http://localhost:5174)
cd web
npm install
npm run dev
```

Port API diatur oleh `PORT` di `base_server/.env`. Jika alamat API berbeda dari bawaan, salin `web/.env.example` menjadi `web/.env`, ubah `VITE_API_URL` sesuai port API, lalu restart `npm run dev`.

### Database

`database.sqlite` dibuat otomatis dari `src/sql_scripts/init.sql` saat server dijalankan pertama kali, lengkap dengan data awal. File ini tidak ikut di-commit (lihat `.gitignore`). Untuk mengembalikan data ke kondisi awal, hentikan server, hapus `database.sqlite`, lalu jalankan ulang server.

## Fitur

### Pesanan (menu awal)

- Kartu ringkasan: total pesanan, total transaksi, pendapatan yang sudah dibayar, dan jumlah pesanan per status.
- Tambah dan edit pesanan: pilih pelanggan, layanan, berat (kg), dan catatan.
- Perkiraan total tampil otomatis, nilai final dihitung server.
- Pembayaran: bayar sekarang (sebagian atau penuh), pilih metode bayar, dan tombol **Lunasi sisa**.
- Ubah status pesanan langsung dari tabel.
- Cari berdasarkan kode atau nama pelanggan, filter berdasarkan status.
- Menampilkan sisa tagihan dan tanggal pelunasan.

### Pelanggan

- Kartu ringkasan: total pelanggan, aktif 30 hari terakhir, belum pernah transaksi, dan nomor WhatsApp tidak valid.
- Tambah dan edit pelanggan lewat panel samping.
- Riwayat transaksi setiap pelanggan.
- Cari berdasarkan nama atau nomor WhatsApp.
- Urutkan berdasarkan terakhir datang, nama, total belanja, atau jumlah pesanan.
- Tombol Hapus hanya muncul untuk pelanggan yang belum punya pesanan.

### Layanan & Tarif

- Tambah dan edit layanan: nama, harga per kg, estimasi pengerjaan (hari), dan deskripsi.
- Filter layanan: semua, sudah dipakai, dan belum dipakai.
- Peringatan saat harga diubah: harga baru hanya berlaku untuk pesanan baru.
- Tombol Hapus hanya muncul untuk layanan yang belum dipakai pesanan.

## Aturan Bisnis

- **Status pesanan:** Diterima → Dicuci → Disetrika → Siap Diambil → Selesai.
- **Status bayar:** Belum Bayar (belum ada pembayaran), DP (dibayar sebagian), dan Lunas. Nilai di API tetap `DP`, sedangkan di antarmuka ditampilkan sebagai "Belum Lunas".
- **Total harga** = berat × harga per kg, dihitung di server.
- **Kode pesanan** dibuat otomatis dengan format `LDR-0001`.
- Pelanggan atau layanan yang masih dipakai pesanan tidak bisa dihapus.

## Validasi

| Data | Aturan |
|---|---|
| Pelanggan | Nama wajib diisi |
| Pelanggan | Nomor WhatsApp 10 sampai 13 digit |
| Pelanggan | Nomor WhatsApp tidak boleh terdaftar dua kali |
| Layanan | Harga per kg harus lebih dari 0 |
| Layanan | Estimasi pengerjaan minimal 1 hari |
| Pembayaran | Tidak boleh negatif |
| Pembayaran | Tidak boleh melebihi sisa tagihan |
| Pembayaran | Metode bayar wajib dipilih bila ada pembayaran |

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

### Kode status respons

| Kode | Arti |
|---|---|
| 200 / 201 | Berhasil (201 untuk data baru) |
| 400 | Validasi gagal (data tidak sesuai aturan) |
| 404 | Data tidak ditemukan |
| 409 | Data masih dipakai pesanan sehingga tidak bisa dihapus |
| 500 | Kesalahan di server |

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
