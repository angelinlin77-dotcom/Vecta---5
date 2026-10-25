import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react';
import { api, rupiah } from './api';
import { Dashboard, Layanan, Pelanggan, Pesanan, STATUS, Status } from './types';

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
      <div className="card"><span>Total pendapatan</span><b>{rupiah(data.total_pendapatan)}</b></div>
      {STATUS.map((s) => (
        <div className="card" key={s}><span>{s}</span><b>{data.per_status[s]}</b></div>
      ))}
    </section>
  );
}

interface Field { key: string; label: string; type: 'text' | 'number'; required?: boolean }
interface Column<T> { label: string; render: (row: T) => ReactNode }

function CrudPage<T extends { id: number }>(props: {
  title: string;
  path: string;
  fields: Field[];
  columns: Column<T>[];
  onChange: () => void;
}) {
  const { title, path, fields, columns, onChange } = props;
  const { data, error, loading, reload } = useData<T[]>(path);
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
            {data?.map((row) => (
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

interface PesananForm { pelanggan_id: string; layanan_id: string; berat_kg: string; catatan: string }
const emptyPesanan: PesananForm = { pelanggan_id: '', layanan_id: '', berat_kg: '', catatan: '' };

function PesananPage({ onChange }: { onChange: () => void }) {
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (q) params.set('q', q);
  const query = params.toString();
  const { data, error, loading, reload } = useData<Pesanan[]>(`/pesanan${query ? `?${query}` : ''}`);
  const pelanggan = useData<Pelanggan[]>('/pelanggan').data ?? [];
  const layanan = useData<Layanan[]>('/layanan').data ?? [];
  const [form, setForm] = useState<PesananForm>(emptyPesanan);
  const [editId, setEditId] = useState<number | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const harga = layanan.find((l) => l.id === Number(form.layanan_id))?.harga_per_kg ?? 0;
  const estimasi = harga * (Number(form.berat_kg) || 0);
  const reset = () => { setForm(emptyPesanan); setEditId(null); };
  const done = (m: string) => { setMsg(m); setErr(''); reload(); onChange(); };
  const fail = (x: unknown) => { setErr((x as Error).message); setMsg(''); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = {
      pelanggan_id: Number(form.pelanggan_id),
      layanan_id: Number(form.layanan_id),
      berat_kg: Number(form.berat_kg),
      catatan: form.catatan,
    };
    try {
      if (editId === null) await api.post('/pesanan', body);
      else await api.put(`/pesanan/${editId}`, body);
      done(editId === null ? 'Pesanan ditambahkan' : 'Pesanan diperbarui');
      reset();
    } catch (x) { fail(x); }
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
    setForm({
      pelanggan_id: String(p.pelanggan_id),
      layanan_id: String(p.layanan_id),
      berat_kg: String(p.berat_kg),
      catatan: p.catatan,
    });
  };

  return (
    <section>
      <h2>Pesanan</h2>
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
        <p className="muted">Perkiraan total: <b>{rupiah(Math.round(estimasi))}</b> (dihitung final oleh server)</p>
        <div className="actions">
          <button type="submit">{editId === null ? 'Buat Pesanan' : 'Simpan Perubahan'}</button>
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

      {msg && <p className="ok">{msg}</p>}
      {err && <p className="alert">{err}</p>}
      <Notice error={error} loading={loading} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Kode</th><th>Pelanggan</th><th>Layanan</th><th>Berat</th><th>Total</th><th>Status</th><th>Masuk</th><th>Aksi</th></tr>
          </thead>
          <tbody>
            {data?.map((p) => (
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
                <td>{p.tanggal_masuk}</td>
                <td className="actions">
                  <button className="ghost" onClick={() => edit(p)}>Edit</button>
                  <button className="danger" onClick={() => remove(p)}>Hapus</button>
                </td>
              </tr>
            ))}
            {data?.length === 0 && <tr><td colSpan={8} className="muted">Tidak ada pesanan</td></tr>}
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
