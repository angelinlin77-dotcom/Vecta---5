import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { api, rupiah } from './api';
import { Dashboard, Layanan, Pelanggan, Pesanan, STATUS, Status, METODE_BAYAR, StatusBayar } from './types';

// ===== Jam & tanggal berjalan (WIB) =====
const formatTanggal = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Jakarta',
});

const formatJam = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Jakarta',
});

function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <p className="live-clock">
      {formatTanggal.format(now)} · {formatJam.format(now)} WIB
    </p>
  );
}

function PageTitle({ children }: { children: ReactNode }) {
  return (
    <div className="page-title">
      <h2>{children}</h2>
      <LiveClock />
    </div>
  );
}

function useData<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    setLoading(true);
    api
      .get<T>(path)
      .then((d) => { setData(d); setError(''); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [path]);
  useEffect(reload, [reload]);
  return { data, error, loading, reload };
}

const Notice = ({ error, loading }: { error: string; loading: boolean }) =>
  error ? <p className="alert">{error}</p> : loading ? <p className="muted">Memuat data...</p> : null;

function DashboardCards({ version }: { version: number }) {
  const { data, error } = useData<Dashboard>(`/dashboard?v=${version}`);
  // Semua pesanan (tanpa filter) supaya total kartu selalu sama dengan isi tabel
  const semua = useData<Pesanan[]>(`/pesanan?v=${version}`).data;
  if (error || !data) return null;
  const totalTransaksi = semua
    ? semua.reduce((sum, p) => sum + (p.total_harga ?? 0), 0)
    : data.total_transaksi ?? 0;
  const totalPendapatan = semua
    ? semua.reduce((sum, p) => sum + (p.jumlah_dibayar ?? 0), 0)
    : data.total_pendapatan ?? 0;
  return (
    <section className="cards">
      <div className="card"><span>Total pesanan</span><b>{semua ? semua.length : data.total_pesanan}</b></div>
      <div className="card"><span>Total transaksi</span><b>{rupiah(totalTransaksi)}</b></div>
      <div className="card"><span>Pendapatan (sudah dibayar)</span><b>{rupiah(totalPendapatan)}</b></div>
      {STATUS.map((s) => (
        <div className="card" key={s}><span>{s}</span><b>{data.per_status[s] ?? 0}</b></div>
      ))}
    </section>
  );
}

interface PesananForm {
  pelanggan_id: string; layanan_id: string; berat_kg: string; catatan: string;
  metode_bayar: string; bayar: string;
}
const emptyPesanan: PesananForm = {
  pelanggan_id: '', layanan_id: '', berat_kg: '', catatan: '',
  metode_bayar: '', bayar: '',
};

// Pesanan + tanggal bayar terakhir (diisi otomatis oleh server)
type PesananRow = Pesanan & { tanggal_pelunasan?: string | null };

// Tampilan status bayar: "DP" ditampilkan sebagai "Belum Lunas"
const labelBayar = (s?: string) => (s === 'DP' ? 'Belum Lunas' : s ?? 'Belum Bayar');

// Tanggal hari ini (YYYY-MM-DD) menurut jam komputer
const tanggalHariIni = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function PesananPage({ onChange }: { onChange: () => void }) {
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (q) params.set('q', q);
  const query = params.toString();
  const { data, error, loading, reload } = useData<Pesanan[]>(`/pesanan${query ? `?${query}` : ''}`);
  const pelanggan = [...(useData<Pelanggan[]>('/pelanggan').data ?? [])]
    .sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
  const layanan = useData<Layanan[]>('/layanan').data ?? [];
  const [form, setForm] = useState<PesananForm>(emptyPesanan);
  const [editId, setEditId] = useState<number | null>(null);
  const [editRow, setEditRow] = useState<Pesanan | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // Perhitungan pembayaran
  const harga = layanan.find((l) => l.id === Number(form.layanan_id))?.harga_per_kg ?? 0;
  const total = Math.round(harga * (Number(form.berat_kg) || 0));
  const sudahBayar = editRow?.jumlah_dibayar ?? 0;
  const sisaSekarang = Math.max(total - sudahBayar, 0);
  const bayar = Number(form.bayar) || 0;
  const totalDibayar = sudahBayar + bayar;
  const sisaSetelah = Math.max(total - totalDibayar, 0);
  const statusBaru: StatusBayar =
    totalDibayar <= 0 ? 'Belum Bayar' : total > 0 && totalDibayar >= total ? 'Lunas' : 'DP';
  // Kalau pesanan sudah pernah dibayar sebagian, total awal tidak ditampilkan lagi
  const sudahAdaPembayaran = editId !== null && sudahBayar > 0;

  const reset = () => { setForm(emptyPesanan); setEditId(null); setEditRow(null); };
  const done = (m: string) => { setMsg(m); setErr(''); reload(); onChange(); };
  const fail = (x: unknown) => { setErr((x as Error).message); setMsg(''); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (bayar < 0) return fail(new Error('Pembayaran tidak boleh negatif'));
    if (bayar > sisaSekarang) return fail(new Error(`Pembayaran melebihi sisa tagihan (${rupiah(sisaSekarang)})`));
    if (totalDibayar > 0 && !form.metode_bayar) return fail(new Error('Pilih metode bayar'));

    const body = {
      pelanggan_id: Number(form.pelanggan_id),
      layanan_id: Number(form.layanan_id),
      berat_kg: Number(form.berat_kg),
      catatan: form.catatan,
      // saat edit, pertahankan status dan tanggal masuk yang lama
      status: editRow?.status,
      tanggal_masuk: editRow?.tanggal_masuk,
      metode_bayar: totalDibayar > 0 ? form.metode_bayar : '',
      // dikirim lengkap supaya cocok dengan controller versi lama maupun baru
      status_bayar: statusBaru,
      jumlah_dibayar: statusBaru === 'DP' ? totalDibayar : 0,
      bayar_sekarang: bayar,
    };
    try {
      if (editId === null) await api.post<Pesanan>('/pesanan', body);
      else await api.put<Pesanan>(`/pesanan/${editId}`, body);
      done(editId === null ? 'Pesanan ditambahkan' : 'Pesanan diperbarui');
      reset();
    } catch (x) {
      console.error('Simpan gagal:', x);
      fail(x);
    }
  }

  async function changeStatus(p: Pesanan, s: Status) {
    try { await api.patch(`/pesanan/${p.id}/status`, { status: s }); done(`Status ${p.kode} menjadi ${s}`); }
    catch (x) { fail(x); }
  }

  async function remove(p: Pesanan) {
    if (!confirm(`Hapus pesanan ${p.kode}?`)) return;
    try { await api.del(`/pesanan/${p.id}`); done(`Pesanan ${p.kode} dihapus`); }
    catch (x) { fail(x); }
  }

  const edit = (p: Pesanan) => {
    setEditId(p.id);
    setEditRow(p);
    setMsg('');
    setErr('');
    setForm({
      pelanggan_id: String(p.pelanggan_id),
      layanan_id: String(p.layanan_id),
      berat_kg: String(p.berat_kg),
      catatan: p.catatan,
      metode_bayar: p.metode_bayar ?? '',
      bayar: '', // dikosongkan: diisi hanya untuk pembayaran tambahan
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <section>
      <PageTitle>Pesanan</PageTitle>
      {msg && <p className="ok">{msg}</p>}
      {err && <p className="alert">{err}</p>}
      <form className="form" onSubmit={submit}>
        <label>
          Pelanggan
          <select required value={form.pelanggan_id} onChange={(e) => setForm({ ...form, pelanggan_id: e.target.value })}>
            <option value="">Pilih pelanggan</option>
            {pelanggan.map((p) => <option key={p.id} value={p.id}>{p.nama}</option>)}
          </select>
        </label>
        <label>
          Layanan
          <select required value={form.layanan_id} onChange={(e) => setForm({ ...form, layanan_id: e.target.value })}>
            <option value="">Pilih layanan</option>
            {layanan.map((l) => <option key={l.id} value={l.id}>{l.nama} ({rupiah(l.harga_per_kg)}/kg)</option>)}
          </select>
        </label>
        <label>
          Berat (kg)
          <input type="number" step="0.1" min="0.1" required value={form.berat_kg}
            onChange={(e) => setForm({ ...form, berat_kg: e.target.value })} />
        </label>
        <label>
          Catatan
          <input value={form.catatan} onChange={(e) => setForm({ ...form, catatan: e.target.value })} />
        </label>
        <label>
          Bayar sekarang (Rp)
          <input type="number" min="0" step="1" value={form.bayar}
            onChange={(e) => setForm({ ...form, bayar: e.target.value })} />
        </label>
        <label>
          Metode bayar
          <select required={totalDibayar > 0} value={form.metode_bayar}
            onChange={(e) => setForm({ ...form, metode_bayar: e.target.value })}>
            <option value="">Pilih metode</option>
            {METODE_BAYAR.map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
        <label>
          Tanggal bayar (otomatis)
          <input type="text" readOnly value={tanggalHariIni()} />
        </label>

        <p className="muted">
          {sudahAdaPembayaran ? (
            <>
              Sudah dibayar: <b>{rupiah(sudahBayar)}</b>
              {' · '}Sisa tagihan saat ini: <b>{rupiah(sisaSekarang)}</b>
            </>
          ) : (
            <>Perkiraan total: <b>{rupiah(total)}</b> (dihitung final oleh server)</>
          )}
          {bayar > 0 && (
            <>
              {' · '}Sisa setelah pembayaran ini: <b>{rupiah(sisaSetelah)}</b>
            </>
          )}
          {' · '}Status bayar: <b>{labelBayar(statusBaru)}</b>
        </p>

        <div className="actions">
          <button type="submit">{editId === null ? 'Buat Pesanan' : 'Simpan Perubahan'}</button>
          <button type="button" className="ghost" onClick={() => setForm({ ...form, bayar: String(sisaSekarang) })}>
            Lunasi sisa
          </button>
          {editId !== null && <button type="button" className="ghost" onClick={reset}>Batal</button>}
        </div>
      </form>

      <div className="filters">
        <input placeholder="Cari kode atau nama pelanggan" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Semua status</option>
          {STATUS.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      <Notice error={error} loading={loading} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Kode</th><th>Pelanggan</th><th>Layanan</th><th>Berat</th><th>Total</th>
              <th>Status</th><th>Status Bayar</th><th>Metode</th><th>Dibayar</th><th>Sisa Tagihan</th>
              <th>Tgl Bayar</th><th>Masuk</th><th>Catatan</th><th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((p) => {
              const dibayar = p.jumlah_dibayar ?? 0;
              const sisa = Math.max(p.total_harga - dibayar, 0);
              const tglBayar = (p as PesananRow).tanggal_pelunasan;
              return (
                <tr key={p.id}>
                  <td>{p.kode}</td>
                  <td>{p.pelanggan_nama}</td>
                  <td>{p.layanan_nama}</td>
                  <td>{p.berat_kg} kg</td>
                  <td>{rupiah(p.total_harga)}</td>
                  <td>
                    <select value={p.status} onChange={(e) => changeStatus(p, e.target.value as Status)}>
                      {STATUS.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td>{labelBayar(p.status_bayar)}</td>
                  <td>{p.metode_bayar || '-'}</td>
                  <td>{dibayar > 0 ? rupiah(dibayar) : '-'}</td>
                  <td>{rupiah(sisa)}</td>
                  <td>{tglBayar || '-'}</td>
                  <td>{p.tanggal_masuk}</td>
                  <td>{p.catatan || '-'}</td>
                  <td className="actions">
                    <button className="ghost" onClick={() => edit(p)}>Edit</button>
                    <button className="danger" onClick={() => remove(p)}>Hapus</button>
                  </td>
                </tr>
              );
            })}
            {data?.length === 0 && <tr><td colSpan={14} className="muted">Tidak ada pesanan</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ===== Halaman Pelanggan =====
const formatTglPendek = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Jakarta',
});

const digitsOnly = (s: string) => s.replace(/\D/g, '');

// 081234567801 -> 0812-3456-7801
const formatWa = (s: string) => {
  const d = digitsOnly(s);
  return [d.slice(0, 4), d.slice(4, 8), d.slice(8)].filter(Boolean).join('-');
};

// Mengembalikan pesan galat, atau '' bila nomor valid (10-13 digit)
function cekWa(s: string): string {
  const v = s.trim();
  if (!v) return 'Nomor WhatsApp wajib diisi.';
  if (/[^\d\s\-+]/.test(v)) return 'Nomor hanya boleh berisi angka.';
  const n = digitsOnly(v).length;
  if (n < 10) return 'Nomor terlalu pendek. Gunakan 10 sampai 13 digit, contoh 0812-3456-7890.';
  if (n > 13) return 'Nomor terlalu panjang. Gunakan 10 sampai 13 digit, contoh 0812-3456-7890.';
  return '';
}

interface PelangganRow extends Pelanggan {
  jumlah: number;
  total: number;
  terakhir: Date | null;
  waValid: boolean;
}

type SortKey = 'terakhir' | 'nama' | 'total' | 'pesanan';

const emptyPelanggan = { nama: '', telepon: '', alamat: '' };

function PelangganPage({ version, onChange }: { version: number; onChange: () => void }) {
  const pel = useData<Pelanggan[]>('/pelanggan');
  const pes = useData<Pesanan[]>(`/pesanan?v=${version}`);

  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('terakhir');
  const [panelOpen, setPanelOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyPelanggan);
  const [submitted, setSubmitted] = useState(false);
  const [riwayat, setRiwayat] = useState<Pelanggan | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // Gabungkan pelanggan dengan ringkasan pesanannya
  const rows: PelangganRow[] = useMemo(() => {
    const pesanan = pes.data ?? [];
    return (pel.data ?? []).map((p) => {
      const milik = pesanan.filter((o) => o.pelanggan_id === p.id);
      let terakhir: Date | null = null;
      for (const o of milik) {
        const t = new Date(String(o.tanggal_masuk).replace(' ', 'T'));
        if (!Number.isNaN(t.getTime()) && (!terakhir || t > terakhir)) terakhir = t;
      }
      return {
        ...p,
        jumlah: milik.length,
        total: milik.reduce((sum, o) => sum + (o.total_harga ?? 0), 0),
        terakhir,
        waValid: cekWa(p.telepon) === '',
      };
    });
  }, [pel.data, pes.data]);

  // Kartu ringkasan
  const now = Date.now();
  const aktif = rows.filter((r) => r.terakhir && now - r.terakhir.getTime() <= 30 * 86400000).length;
  const belum = rows.filter((r) => r.jumlah === 0);
  const tidakValid = rows.filter((r) => !r.waValid);
  const namaBelum = belum.slice(0, 2).map((r) => r.nama).join(', ') + (belum.length > 2 ? ', dll' : '');

  // Cari + urutkan
  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const kwDigits = digitsOnly(kw);
    return rows
      .filter(
        (r) =>
          !kw ||
          r.nama.toLowerCase().includes(kw) ||
          (kwDigits !== '' && digitsOnly(r.telepon).includes(kwDigits)),
      )
      .sort((a, b) => {
        if (sort === 'nama') return a.nama.localeCompare(b.nama, 'id');
        if (sort === 'total') return b.total - a.total;
        if (sort === 'pesanan') return b.jumlah - a.jumlah;
        return (b.terakhir?.getTime() ?? -1) - (a.terakhir?.getTime() ?? -1) || a.nama.localeCompare(b.nama, 'id');
      });
  }, [rows, q, sort]);

  // Validasi form
  const waErr = cekWa(form.telepon);
  const formDigits = digitsOnly(form.telepon);
  const duplikat = formDigits
    ? rows.find((r) => r.id !== editId && digitsOnly(r.telepon) === formDigits)
    : undefined;
  const waMsg =
    form.telepon || submitted
      ? waErr || (duplikat ? `Nomor sudah terdaftar atas nama ${duplikat.nama}.` : '')
      : '';
  const namaMsg = submitted && !form.nama.trim() ? 'Nama lengkap wajib diisi.' : '';

  const closePanel = () => {
    setPanelOpen(false);
    setEditId(null);
    setForm(emptyPelanggan);
    setSubmitted(false);
  };

  const openTambah = () => {
    setEditId(null);
    setForm(emptyPelanggan);
    setSubmitted(false);
    setMsg('');
    setErr('');
    setPanelOpen(true);
  };

  const openEdit = (r: PelangganRow) => {
    setEditId(r.id);
    setForm({ nama: r.nama, telepon: r.telepon, alamat: r.alamat ?? '' });
    setSubmitted(false);
    setMsg('');
    setErr('');
    setPanelOpen(true);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!form.nama.trim() || waErr || duplikat) return;
    const body = { nama: form.nama.trim(), telepon: form.telepon.trim(), alamat: form.alamat.trim() };
    try {
      if (editId === null) await api.post('/pelanggan', body);
      else await api.put(`/pelanggan/${editId}`, body);
      setMsg(editId === null ? 'Pelanggan ditambahkan' : 'Pelanggan diperbarui');
      setErr('');
      closePanel();
      pel.reload();
      onChange();
    } catch (x) {
      setErr((x as Error).message);
      setMsg('');
    }
  }

  async function remove(r: PelangganRow) {
    if (!confirm(`Hapus pelanggan ${r.nama}?`)) return;
    try {
      await api.del(`/pelanggan/${r.id}`);
      setMsg('Pelanggan dihapus');
      setErr('');
      pel.reload();
      onChange();
    } catch (x) {
      setErr((x as Error).message);
      setMsg('');
    }
  }

  const riwayatPesanan = riwayat
    ? (pes.data ?? [])
        .filter((o) => o.pelanggan_id === riwayat.id)
        .sort((a, b) => String(b.tanggal_masuk).localeCompare(String(a.tanggal_masuk)))
    : [];

  return (
    <section className="pel">
      <div className="pel-head">
        <div>
          <h2>Pelanggan</h2>
          <p className="pel-sub">Data kontak dan riwayat transaksi setiap pelanggan</p>
          <LiveClock />
        </div>
        <button type="button" className="pel-btn" onClick={openTambah}>+ Tambah Pelanggan</button>
      </div>

      {msg && <p className="ok">{msg}</p>}
      {err && <p className="alert">{err}</p>}
      <Notice error={pel.error || pes.error} loading={pel.loading && !pel.data} />

      <div className="pel-stats">
        <div className="pel-stat">
          <span>Total pelanggan</span>
          <b>{rows.length}</b>
          <small>terdaftar di sistem</small>
        </div>
        <div className="pel-stat">
          <span>Aktif 30 hari terakhir</span>
          <b>{aktif}</b>
          <small>punya minimal 1 pesanan</small>
        </div>
        <div className="pel-stat">
          <span>Belum pernah transaksi</span>
          <b>{belum.length}</b>
          <small>{belum.length ? namaBelum : 'semua sudah bertransaksi'}</small>
        </div>
        <div className="pel-stat warn">
          <span>Data perlu dicek</span>
          <b>{tidakValid.length}</b>
          <small>nomor WhatsApp tidak valid</small>
        </div>
      </div>

      <div className={panelOpen ? 'pel-body with-panel' : 'pel-body'}>
        <div className="pel-main">
          <div className="pel-toolbar">
            <input
              placeholder="Cari nama atau no. WhatsApp"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="terakhir">Urutkan: terakhir datang</option>
              <option value="nama">Urutkan: nama A-Z</option>
              <option value="total">Urutkan: total belanja</option>
              <option value="pesanan">Urutkan: jumlah pesanan</option>
            </select>
          </div>

          <div className="pel-tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Pelanggan</th>
                  <th>No. WhatsApp</th>
                  <th>Pesanan</th>
                  <th>Total belanja</th>
                  <th>Terakhir datang</th>
                  <th className="right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className={r.waValid ? '' : 'warn'}>
                    <td className="nama">
                      <div className="pel-person">
                        <span className={`pel-avatar av${r.id % 5}`} aria-hidden="true">
                          {r.nama.trim().charAt(0).toUpperCase() || '?'}
                        </span>
                        <div>
                          <b>{r.nama}</b>
                          <small>{r.alamat || '-'}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      {formatWa(r.telepon) || '-'}
                      {!r.waValid && <span className="pel-badge">Tidak valid</span>}
                    </td>
                    <td><span className={r.jumlah ? 'pel-count' : 'pel-count zero'}>{r.jumlah}</span></td>
                    <td><b>{rupiah(r.total)}</b></td>
                    <td className="muted">{r.terakhir ? formatTglPendek.format(r.terakhir) : 'Belum pernah'}</td>
                    <td>
                      <div className="pel-actions">
                        {r.jumlah > 0 && (
                          <button type="button" className="pel-outline" onClick={() => setRiwayat(r)}>Riwayat</button>
                        )}
                        <button type="button" className="pel-ghost" onClick={() => openEdit(r)}>Edit</button>
                        {r.jumlah === 0 && (
                          <button type="button" className="pel-del" onClick={() => remove(r)}>Hapus</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr><td colSpan={6} className="muted">{rows.length ? 'Tidak ada pelanggan yang cocok' : 'Belum ada data'}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="pel-note">
            <span aria-hidden="true">ⓘ</span>
            Tombol Hapus hanya muncul untuk pelanggan tanpa pesanan. Pelanggan yang sudah bertransaksi
            tidak bisa dihapus supaya riwayatnya tetap utuh.
          </p>
        </div>

        {panelOpen && (
          <form className="pel-panel" onSubmit={submit} noValidate>
            <div className="pel-panel-head">
              <h3>{editId === null ? 'Tambah Pelanggan' : 'Edit Pelanggan'}</h3>
              <button type="button" className="pel-ghost pel-x" aria-label="Tutup" onClick={closePanel}>✕</button>
            </div>

            <label>
              <span>Nama lengkap <i>*</i></span>
              <input
                autoFocus
                className={namaMsg ? 'bad' : ''}
                placeholder="Contoh: Dina Lestari"
                value={form.nama}
                onChange={(e) => setForm({ ...form, nama: e.target.value })}
              />
              {namaMsg && <em>{namaMsg}</em>}
            </label>

            <label>
              <span>No. WhatsApp <i>*</i></span>
              <input
                inputMode="tel"
                className={waMsg ? 'bad' : ''}
                placeholder="0812-3456-7890"
                value={form.telepon}
                onChange={(e) => setForm({ ...form, telepon: e.target.value })}
              />
              {waMsg && <em>{waMsg}</em>}
            </label>

            <label>
              <span>Alamat <small>(opsional, wajib bila antar jemput)</small></span>
              <textarea
                rows={3}
                placeholder="Nama jalan, nomor, kelurahan, kota"
                value={form.alamat}
                onChange={(e) => setForm({ ...form, alamat: e.target.value })}
              />
            </label>

            <p className="pel-info">
              Sistem otomatis mengecek nomor yang sudah terdaftar supaya tidak ada pelanggan ganda.
            </p>

            <div className="pel-panel-actions">
              <button type="button" className="pel-ghost" onClick={closePanel}>Batal</button>
              <button type="submit" className="pel-btn">Simpan</button>
            </div>
          </form>
        )}
      </div>

      {riwayat && (
        <div className="pel-modal-bg" onClick={() => setRiwayat(null)}>
          <div className="pel-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="pel-panel-head">
              <h3>Riwayat {riwayat.nama}</h3>
              <button type="button" className="pel-ghost pel-x" aria-label="Tutup" onClick={() => setRiwayat(null)}>✕</button>
            </div>
            <div className="pel-tablewrap">
              <table>
                <thead>
                  <tr><th>Kode</th><th>Layanan</th><th>Berat</th><th>Total</th><th>Status</th><th>Status bayar</th><th>Masuk</th></tr>
                </thead>
                <tbody>
                  {riwayatPesanan.map((o) => (
                    <tr key={o.id}>
                      <td>{o.kode}</td>
                      <td>{o.layanan_nama}</td>
                      <td>{o.berat_kg} kg</td>
                      <td>{rupiah(o.total_harga)}</td>
                      <td>{o.status}</td>
                      <td>{labelBayar(o.status_bayar)}</td>
                      <td>{o.tanggal_masuk}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ===== Halaman Layanan & Tarif =====
interface LayananForm {
  nama: string;
  harga_per_kg: string;
  estimasi_hari: string;
  deskripsi: string;
}
const emptyLayanan: LayananForm = { nama: '', harga_per_kg: '', estimasi_hari: '', deskripsi: '' };

type LayananFilter = 'semua' | 'dipakai' | 'belum';

function LayananPage({ version, onChange }: { version: number; onChange: () => void }) {
  const lay = useData<Layanan[]>('/layanan');
  const pes = useData<Pesanan[]>(`/pesanan?v=${version}`);

  const [filter, setFilter] = useState<LayananFilter>('semua');
  const [panelOpen, setPanelOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<LayananForm>(emptyLayanan);
  const [submitted, setSubmitted] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // Gabungkan layanan dengan jumlah pesanan yang memakainya
  const rows = useMemo(() => {
    const pesanan = pes.data ?? [];
    return [...(lay.data ?? [])]
      .sort((a, b) => a.nama.localeCompare(b.nama, 'id'))
      .map((l) => ({ ...l, dipakai: pesanan.filter((o) => o.layanan_id === l.id).length }));
  }, [lay.data, pes.data]);

  const jmlDipakai = rows.filter((r) => r.dipakai > 0).length;
  const shown = rows.filter((r) =>
    filter === 'semua' ? true : filter === 'dipakai' ? r.dipakai > 0 : r.dipakai === 0,
  );

  const editing = rows.find((r) => r.id === editId);
  const hargaBaru = Number(form.harga_per_kg);
  const hargaBerubah =
    editing !== undefined && hargaBaru > 0 && hargaBaru !== editing.harga_per_kg;
  const estimasiBaru = Number(form.estimasi_hari);

  // Validasi
  const namaMsg = submitted && !form.nama.trim() ? 'Nama layanan wajib diisi.' : '';
  const hargaMsg = submitted && !(hargaBaru > 0) ? 'Harga harus lebih dari 0.' : '';
  const estMsg =
    submitted && !(Number.isInteger(estimasiBaru) && estimasiBaru >= 1)
      ? 'Estimasi minimal 1 hari.'
      : '';

  const closePanel = () => {
    setPanelOpen(false);
    setEditId(null);
    setForm(emptyLayanan);
    setSubmitted(false);
  };

  const openTambah = () => {
    setEditId(null);
    setForm(emptyLayanan);
    setSubmitted(false);
    setMsg('');
    setErr('');
    setPanelOpen(true);
  };

  const openEdit = (r: Layanan) => {
    setEditId(r.id);
    setForm({
      nama: r.nama,
      harga_per_kg: String(r.harga_per_kg),
      estimasi_hari: String(r.estimasi_hari),
      deskripsi: r.deskripsi ?? '',
    });
    setSubmitted(false);
    setMsg('');
    setErr('');
    setPanelOpen(true);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!form.nama.trim() || !(hargaBaru > 0) || !(Number.isInteger(estimasiBaru) && estimasiBaru >= 1)) return;
    const body = {
      nama: form.nama.trim(),
      harga_per_kg: hargaBaru,
      estimasi_hari: estimasiBaru,
      deskripsi: form.deskripsi.trim(),
    };
    try {
      if (editId === null) await api.post('/layanan', body);
      else await api.put(`/layanan/${editId}`, body);
      setMsg(editId === null ? 'Layanan ditambahkan' : 'Layanan diperbarui');
      setErr('');
      closePanel();
      lay.reload();
      onChange();
    } catch (x) {
      setErr((x as Error).message);
      setMsg('');
    }
  }

  async function remove(r: Layanan) {
    if (!confirm(`Hapus layanan ${r.nama}?`)) return;
    try {
      await api.del(`/layanan/${r.id}`);
      setMsg('Layanan dihapus');
      setErr('');
      if (editId === r.id) closePanel();
      lay.reload();
      onChange();
    } catch (x) {
      setErr((x as Error).message);
      setMsg('');
    }
  }

  return (
    <section className="lay">
      <div className="lay-head">
        <div>
          <h2>Layanan &amp; Tarif</h2>
          <p className="lay-sub">Atur daftar layanan, harga, dan estimasi pengerjaan</p>
          <LiveClock />
        </div>
        <button type="button" className="lay-btn" onClick={openTambah}>+ Tambah Layanan</button>
      </div>

      {msg && <p className="ok">{msg}</p>}
      {err && <p className="alert">{err}</p>}
      <Notice error={lay.error || pes.error} loading={lay.loading && !lay.data} />

      <div className={panelOpen ? 'lay-body with-panel' : 'lay-body'}>
        <div className="lay-main">
          <div className="lay-card">
            <div className="lay-chips">
              <button type="button" className={filter === 'semua' ? 'lay-chip on' : 'lay-chip'} onClick={() => setFilter('semua')}>
                Semua ({rows.length})
              </button>
              <button type="button" className={filter === 'dipakai' ? 'lay-chip on' : 'lay-chip'} onClick={() => setFilter('dipakai')}>
                Sudah dipakai ({jmlDipakai})
              </button>
              <button type="button" className={filter === 'belum' ? 'lay-chip on' : 'lay-chip'} onClick={() => setFilter('belum')}>
                Belum dipakai ({rows.length - jmlDipakai})
              </button>
            </div>

            <div className="lay-tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Layanan</th>
                    <th>Harga</th>
                    <th>Estimasi</th>
                    <th>Dipakai</th>
                    <th className="right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id} className={r.id === editId ? 'editing' : ''}>
                      <td>
                        <b className="lay-name">{r.nama}</b>
                        <small>{r.deskripsi || '-'}</small>
                      </td>
                      <td><b>{rupiah(r.harga_per_kg)}</b> <span className="muted">/ kg</span></td>
                      <td>
                        {r.estimasi_hari} hari <span className="muted">({r.estimasi_hari * 24} jam)</span>
                      </td>
                      <td className={r.dipakai ? '' : 'muted'}>
                        {r.dipakai ? `${r.dipakai} pesanan` : 'Belum dipakai'}
                      </td>
                      <td>
                        <div className="lay-actions">
                          {r.id === editId ? (
                            <span className="lay-editing">sedang diedit</span>
                          ) : (
                            <>
                              <button type="button" className="lay-outline" onClick={() => openEdit(r)}>Edit</button>
                              {r.dipakai === 0 && (
                                <button type="button" className="lay-del" onClick={() => remove(r)}>Hapus</button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {shown.length === 0 && (
                    <tr><td colSpan={5} className="muted">{rows.length ? 'Tidak ada layanan pada filter ini' : 'Belum ada data'}</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <p className="lay-note">
              <span aria-hidden="true">ⓘ</span>
              Layanan yang sudah dipakai pesanan tidak bisa dihapus. Tombol Hapus hanya muncul untuk layanan yang belum dipakai.
            </p>
          </div>
        </div>

        {panelOpen && (
          <form className="lay-panel" onSubmit={submit} noValidate>
            <div className="lay-panel-head">
              <h3>{editId === null ? 'Tambah Layanan' : 'Edit Layanan'}</h3>
              <button type="button" className="lay-x" aria-label="Tutup" onClick={closePanel}>✕</button>
            </div>

            <label>
              <span>Nama layanan <i>*</i></span>
              <input
                autoFocus
                className={namaMsg ? 'bad' : ''}
                placeholder="Contoh: Cuci Kering"
                value={form.nama}
                onChange={(e) => setForm({ ...form, nama: e.target.value })}
              />
              {namaMsg && <em>{namaMsg}</em>}
            </label>

            <label>
              <span>Harga per kg <i>*</i></span>
              <div className={hargaMsg ? 'lay-prefix bad' : 'lay-prefix'}>
                <span>Rp</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={form.harga_per_kg}
                  onChange={(e) => setForm({ ...form, harga_per_kg: e.target.value })}
                />
              </div>
              {hargaMsg && <em>{hargaMsg}</em>}
            </label>

            <label>
              <span>Estimasi pengerjaan <i>*</i></span>
              <div className={estMsg ? 'lay-suffix bad' : 'lay-suffix'}>
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={form.estimasi_hari}
                  onChange={(e) => setForm({ ...form, estimasi_hari: e.target.value })}
                />
                <span>hari</span>
              </div>
              {estMsg && <em>{estMsg}</em>}
              {estimasiBaru >= 1 && <small className="lay-hint">Setara {estimasiBaru * 24} jam.</small>}
            </label>

            <label>
              <span>Deskripsi</span>
              <input
                placeholder="Contoh: Cuci dan keringkan, tanpa setrika"
                value={form.deskripsi}
                onChange={(e) => setForm({ ...form, deskripsi: e.target.value })}
              />
            </label>

            {hargaBerubah && editing && (
              <div className="lay-warn">
                <b>Harga berubah dari {rupiah(editing.harga_per_kg)} ke {rupiah(hargaBaru)}</b>
                <span>
                  Hanya berlaku untuk pesanan baru.
                  {editing.dipakai > 0 &&
                    ` ${editing.dipakai} pesanan lama tetap tercatat ${rupiah(editing.harga_per_kg)}/kg.`}
                </span>
              </div>
            )}

            <div className="lay-panel-actions">
              <button type="button" className="lay-outline" onClick={closePanel}>Batal</button>
              <button type="submit" className="lay-btn">
                {editId === null ? 'Simpan Layanan' : 'Simpan Perubahan'}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

const TABS = ['Pesanan', 'Pelanggan', 'Layanan'] as const;

export default function App() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Pesanan');
  const [version, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);

  return (
    <main>
      <header>
        <h1>Milky Wash</h1>
        <nav>
          {TABS.map((t) => (
            <button key={t} className={t === tab ? 'tab active' : 'tab'} onClick={() => setTab(t)}>{t}</button>
          ))}
        </nav>
      </header>
      {tab === 'Pesanan' && <DashboardCards version={version} />}
      {tab === 'Pesanan' && <PesananPage onChange={refresh} />}
      {tab === 'Pelanggan' && <PelangganPage version={version} onChange={refresh} />}
      {tab === 'Layanan' && <LayananPage version={version} onChange={refresh} />}
    </main>
  );
}