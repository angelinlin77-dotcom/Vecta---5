import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react';
import { api, rupiah } from './api';
import { Dashboard, Layanan, Pelanggan, Pesanan, STATUS, Status, METODE_BAYAR, StatusBayar } from './types';

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
  if (error || !data) return null;
  return (
    <section className="cards">
      <div className="card"><span>Total pesanan</span><b>{data.total_pesanan}</b></div>
      <div className="card"><span>Total transaksi</span><b>{rupiah(data.total_transaksi ?? 0)}</b></div>
      <div className="card"><span>Pendapatan (sudah dibayar)</span><b>{rupiah(data.total_pendapatan ?? 0)}</b></div>
      {STATUS.map((s) => (
        <div className="card" key={s}><span>{s}</span><b>{data.per_status[s] ?? 0}</b></div>
      ))}
    </section>
  );
}

interface Field { key: string; label: string; type: 'text' | 'number'; required?: boolean }
interface Column<T> { label: string; render: (row: T) => ReactNode }

function CrudPage<T extends { id: number; nama: string }>(props: {
  title: string;
  path: string;
  fields: Field[];
  columns: Column<T>[];
  onChange: () => void;
}) {
  const { title, path, fields, columns, onChange } = props;
  const { data, error, loading, reload } = useData<T[]>(path);
  const sorted = [...(data ?? [])].sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
  const [form, setForm] = useState<Record<string, string>>({});
  const [editId, setEditId] = useState<number | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const reset = () => { setForm({}); setEditId(null); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = Object.fromEntries(
      fields.map((f) => [f.key, f.type === 'number' && form[f.key] !== '' ? Number(form[f.key]) : form[f.key] ?? '']),
    );
    try {
      if (editId === null) await api.post(path, body);
      else await api.put(`${path}/${editId}`, body);
      setMsg(editId === null ? `${title} ditambahkan` : `${title} diperbarui`);
      setErr('');
      reset();
      reload();
      onChange();
    } catch (x) { setErr((x as Error).message); setMsg(''); }
  }

  async function remove(row: T) {
    if (!confirm(`Hapus ${title.toLowerCase()} ini?`)) return;
    try {
      await api.del(`${path}/${row.id}`);
      setMsg(`${title} dihapus`);
      setErr('');
      reload();
      onChange();
    } catch (x) { setErr((x as Error).message); setMsg(''); }
  }

  const edit = (row: T) => {
    setEditId(row.id);
    setForm(Object.fromEntries(fields.map((f) => [f.key, String((row as unknown as Record<string, unknown>)[f.key] ?? '')])));
  };

  return (
    <section>
      <h2>{title}</h2>
      <form className="form" onSubmit={submit}>
        {fields.map((f) => (
          <label key={f.key}>
            {f.label}
            <input
              type={f.type}
              min={f.type === 'number' ? 1 : undefined}
              required={f.required}
              value={form[f.key] ?? ''}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
            />
          </label>
        ))}
        <div className="actions">
          <button type="submit">{editId === null ? 'Tambah' : 'Simpan'}</button>
          {editId !== null && <button type="button" className="ghost" onClick={reset}>Batal</button>}
        </div>
      </form>
      {msg && <p className="ok">{msg}</p>}
      {err && <p className="alert">{err}</p>}
      <Notice error={error} loading={loading} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>{columns.map((c) => <th key={c.label}>{c.label}</th>)}<th>Aksi</th></tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.id}>
                {columns.map((c) => <td key={c.label}>{c.render(row)}</td>)}
                <td className="actions">
                  <button className="ghost" onClick={() => edit(row)}>Edit</button>
                  <button className="danger" onClick={() => remove(row)}>Hapus</button>
                </td>
              </tr>
            ))}
            {data?.length === 0 && <tr><td colSpan={columns.length + 1} className="muted">Belum ada data</td></tr>}
          </tbody>
        </table>
      </div>
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
      status_bayar: statusBaru,
      metode_bayar: totalDibayar > 0 ? form.metode_bayar : '',
      jumlah_dibayar: statusBaru === 'DP' ? totalDibayar : 0, // Lunas dihitung server
    };
    try {
      if (editId === null) await api.post('/pesanan', body);
      else await api.put(`/pesanan/${editId}`, body);
      done(editId === null ? 'Pesanan ditambahkan' : 'Pesanan diperbarui');
      reset();
    } catch (x) {
      console.error('Simpan gagal:', x);
      fail(x);
    } finally {
      reload();
      onChange();
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
      <h2>Pesanan</h2>
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

        <p className="muted">
          Perkiraan total: <b>{rupiah(total)}</b> (dihitung final oleh server)
          {editId !== null && (
            <>
              {' · '}Sudah dibayar: <b>{rupiah(sudahBayar)}</b>
              {' · '}Sisa tagihan saat ini: <b>{rupiah(sisaSekarang)}</b>
            </>
          )}
          {bayar > 0 && (
            <>
              {' · '}Sisa setelah pembayaran ini: <b>{rupiah(sisaSetelah)}</b>
            </>
          )}
          {' · '}Status bayar: <b>{statusBaru}</b>
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
              <th>Masuk</th><th>Catatan</th><th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((p) => {
              const dibayar = p.jumlah_dibayar ?? 0;
              const sisa = Math.max(p.total_harga - dibayar, 0);
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
                  <td>{p.status_bayar ?? 'Belum Bayar'}</td>
                  <td>{p.metode_bayar || '-'}</td>
                  <td>{dibayar > 0 ? rupiah(dibayar) : '-'}</td>
                  <td>{rupiah(sisa)}</td>
                  <td>{p.tanggal_masuk}</td>
                  <td>{p.catatan || '-'}</td>
                  <td className="actions">
                    <button className="ghost" onClick={() => edit(p)}>Edit</button>
                    <button className="danger" onClick={() => remove(p)}>Hapus</button>
                  </td>
                </tr>
              );
            })}
            {data?.length === 0 && <tr><td colSpan={13} className="muted">Tidak ada pesanan</td></tr>}
          </tbody>
        </table>
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
        <h1>Laundry</h1>
        <nav>
          {TABS.map((t) => (
            <button key={t} className={t === tab ? 'tab active' : 'tab'} onClick={() => setTab(t)}>{t}</button>
          ))}
        </nav>
      </header>
      <DashboardCards version={version} />
      {tab === 'Pesanan' && <PesananPage onChange={refresh} />}
      {tab === 'Pelanggan' && (
        <CrudPage<Pelanggan>
          title="Pelanggan"
          path="/pelanggan"
          onChange={refresh}
          fields={[
            { key: 'nama', label: 'Nama', type: 'text', required: true },
            { key: 'telepon', label: 'Telepon', type: 'text', required: true },
            { key: 'alamat', label: 'Alamat', type: 'text' },
          ]}
          columns={[
            { label: 'Nama', render: (r) => r.nama },
            { label: 'Telepon', render: (r) => r.telepon },
            { label: 'Alamat', render: (r) => r.alamat },
          ]}
        />
      )}
      {tab === 'Layanan' && (
        <CrudPage<Layanan>
          title="Layanan"
          path="/layanan"
          onChange={refresh}
          fields={[
            { key: 'nama', label: 'Nama layanan', type: 'text', required: true },
            { key: 'harga_per_kg', label: 'Harga per kg (Rp)', type: 'number', required: true },
            { key: 'estimasi_hari', label: 'Estimasi (hari)', type: 'number', required: true },
            { key: 'deskripsi', label: 'Deskripsi', type: 'text' },
          ]}
          columns={[
            { label: 'Nama', render: (r) => r.nama },
            { label: 'Harga/kg', render: (r) => rupiah(r.harga_per_kg) },
            { label: 'Estimasi', render: (r) => `${r.estimasi_hari} hari` },
            { label: 'Deskripsi', render: (r) => r.deskripsi },
          ]}
        />
      )}
    </main>
  );
}