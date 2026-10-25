# Laundry – UTS Pengembangan Aplikasi berbasis Platform

- `base_server/` API dari dosen, ditambah domain Laundry (Pelanggan, Layanan, Pesanan). `/api/products` tidak diubah.
- `web/` Web Client React + TypeScript + Vite (CRUD Pesanan, Pelanggan, Layanan + ringkasan).

## Perubahan pada base_server (selain file baru)
| File | Perubahan |
|---|---|
| `server.js` | +2 baris: `require` dan `app.use('/api', laundryRoutes)` |
| `src/sql_scripts/init.sql` | +tabel `pelanggan`, `layanan`, `pesanan` dan data awal |
| `src/routes/laundryRoutes.js`, `src/controllers/laundryController.js`, `src/models/laundryModel.js` | file baru, pola routes → controllers → models seperti template |

## Menjalankan
```bash
# Terminal 1: API (port dari base_server/.env, mis. 5173)
cd base_server && npm install && npm start

# Terminal 2: Web di http://localhost:5174
cd web && npm install && npm run dev
```
Bila port API bukan 5173, salin `web/.env.example` menjadi `web/.env` dan ubah `VITE_API_URL` (lalu restart `npm run dev`).

## Endpoint baru
`/api/pelanggan`, `/api/layanan` (GET, GET/:id, POST, PUT/:id, DELETE/:id), `/api/pesanan` (sama, plus `PATCH /:id/status`, filter `status`, `pelanggan_id`, `q`), `GET /api/dashboard`.
`total_harga` pesanan dihitung server (berat × harga per kg). Pelanggan atau layanan yang masih dipakai pesanan tidak bisa dihapus (409).
