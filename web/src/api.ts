const BASE: string = import.meta.env.VITE_API_URL ?? 'http://localhost:5173/api';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('Tidak dapat terhubung ke API. Pastikan server API sudah berjalan.');
  }
  const json = await res.json().catch(() => null);
  // base_server mengirim detail galat di `error`, API lama di `message`
  if (!res.ok || !json?.success) throw new Error(json?.error ?? json?.message ?? `Permintaan gagal (${res.status})`);
  return json.data as T;
}

export const api = {
  get: <T,>(path: string) => request<T>('GET', path),
  post: <T,>(path: string, body: unknown) => request<T>('POST', path, body),
  put: <T,>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T,>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: <T,>(path: string) => request<T>('DELETE', path),
};

export const rupiah = (n: number) => 'Rp ' + n.toLocaleString('id-ID');
