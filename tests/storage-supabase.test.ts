import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Almacenamiento Supabase (bucket privado)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.STORAGE_DRIVER = 'local';
  });

  it('sube, descarga y verifica con la clave del servidor y rutas privadas', async () => {
    process.env.STORAGE_DRIVER = 'supabase';
    process.env.SUPABASE_URL = 'https://ref.supabase.co/';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (init.method === 'POST') return new Response('{}', { status: 200 });
      if (url.includes('no-existe')) return new Response('not found', { status: 400 });
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    });
    const { putFile, getFile, fileExists, storageProblem } = await import('@/lib/storage');
    expect(storageProblem()).toBeNull();
    const r = await putFile('signatures/ev 1/a.png', Buffer.from([1, 2, 3]));
    expect(r.size).toBe(3);
    expect(calls[0].url).toBe('https://ref.supabase.co/storage/v1/object/firmaqr/firmaqr/signatures/ev%201/a.png');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer service-key');
    expect((calls[0].init.headers as Record<string, string>)['Content-Type']).toBe('image/png');
    expect([...(await getFile('signatures/ev 1/a.png'))]).toEqual([1, 2, 3]);
    expect(calls[1].url).toContain('/storage/v1/object/authenticated/firmaqr/');
    expect(await fileExists('no-existe.pdf')).toBe(false);
    await expect(putFile('../fuera.txt', Buffer.from('x'))).rejects.toThrow(/inválida/);
  });

  it('en Vercel rechaza el disco local', async () => {
    process.env.VERCEL = '1';
    process.env.STORAGE_DRIVER = 'local';
    const { storageProblem } = await import('@/lib/storage');
    expect(storageProblem()).toMatch(/efímero/);
    delete process.env.VERCEL;
  });
});
