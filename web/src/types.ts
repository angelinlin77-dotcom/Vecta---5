export const STATUS = ['Diterima', 'Dicuci', 'Disetrika', 'Siap Diambil', 'Selesai'] as const;
export type Status = (typeof STATUS)[number];

export const STATUS_BAYAR = ['Belum Bayar', 'DP', 'Lunas'] as const;
export type StatusBayar = (typeof STATUS_BAYAR)[number];

export const METODE_BAYAR = ['Tunai', 'Transfer', 'QRIS'] as const;

export interface Pelanggan {
  id: number;
  nama: string;
  telepon: string;
  alamat: string;
}

export interface Layanan {
  id: number;
  nama: string;
  harga_per_kg: number;
  estimasi_hari: number;
  deskripsi: string;
}

export interface Pesanan {
  id: number;
  kode: string;
  pelanggan_id: number;
  layanan_id: number;
  berat_kg: number;
  total_harga: number;
  status: Status;
  status_bayar: StatusBayar;
  metode_bayar: string;
  jumlah_dibayar: number;
  tanggal_masuk: string;
  catatan: string;
  pelanggan_nama: string | null;
  layanan_nama: string | null;
}

export interface Dashboard {
  total_pesanan: number;
  total_transaksi: number;
  total_pendapatan: number;
  per_status: Record<Status, number>;
}