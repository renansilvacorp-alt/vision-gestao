'use client';

import { authClient } from '@/lib/auth/client';

type RequestOptions = {
  method?: string;
  body?: unknown;
};

async function request<T = unknown>(url: string, options: RequestOptions = {}) {
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers:
      options.body === undefined
        ? undefined
        : { 'Content-Type': 'application/json' },
    body:
      options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: 'include',
    cache: 'no-store',
  });

  const contentType = response.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      data && typeof data === 'object'
        ? String(
            (data as { error?: unknown; message?: unknown }).error ??
              (data as { message?: unknown }).message ??
              'Falha na requisição.'
          )
        : String(data || 'Falha na requisição.');
    throw new Error(message);
  }

  return { data: data as T };
}

export const api = {
  get<T = unknown>(url: string) {
    return request<T>(url);
  },
  post<T = unknown>(url: string, body?: unknown) {
    return request<T>(url, { method: 'POST', body });
  },
  put<T = unknown>(url: string, body?: unknown) {
    return request<T>(url, { method: 'PUT', body });
  },
  delete<T = unknown>(url: string, body?: unknown) {
    return request<T>(url, { method: 'DELETE', body });
  },
};

export const auth = {
  async getUser() {
    const result = await authClient.getSession();
    if (result.error) throw new Error(result.error.message || 'Falha ao consultar sessão.');
    return result.data?.user ?? null;
  },

  async signIn(_options?: { scope?: string }) {
    const result = await authClient.signIn.social({
      provider: 'google',
      callbackURL: typeof window !== 'undefined' ? window.location.origin : '/',
    });
    if (result.error) throw new Error(result.error.message || 'Não foi possível iniciar o login.');
    const nextUrl =
      result.data &&
      typeof result.data === 'object' &&
      'url' in result.data
        ? String((result.data as { url?: unknown }).url ?? '')
        : '';
    if (nextUrl && typeof window !== 'undefined') window.location.assign(nextUrl);
  },

  async signOut() {
    const result = await authClient.signOut();
    if (result.error) throw new Error(result.error.message || 'Não foi possível sair.');
  },
};
