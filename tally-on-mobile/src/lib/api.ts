export async function fetchApi<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.error || json.message || 'Request failed');
  }

  // Handle both response formats: { ok, data } and { success, data }
  if (json.data !== undefined) return json.data as T;
  if (json.ok !== undefined || json.success !== undefined) return json as T;
  return json as T;
}
