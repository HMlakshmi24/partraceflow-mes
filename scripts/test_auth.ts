import fetch from 'node-fetch';

type LoginResult = {
  cookie: string;
  allCookies: string;
};

function splitCookies(setCookieHeader: string): string[] {
  // Split on commas that start a new cookie (avoid commas in Expires)
  return setCookieHeader
    .split(/,(?=[^;]+=)/g)
    .map((c) => c.trim())
    .filter(Boolean);
}

export async function loginAndGetCookie(
  baseUrl: string,
  username: string,
  password: string
): Promise<LoginResult> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Login failed (${res.status}): ${text || res.statusText}`);
  }

  const raw = (res.headers as any).raw?.();
  const setCookies: string[] =
    raw?.['set-cookie'] ??
    (res.headers.get('set-cookie') ? splitCookies(res.headers.get('set-cookie') as string) : []);

  if (setCookies.length === 0) {
    throw new Error('Login response did not include Set-Cookie headers');
  }

  const cookiePairs = setCookies.map((c) => c.split(';')[0]).filter(Boolean);
  const sessionCookie = cookiePairs.find((c) => c.startsWith('mes_session='));

  if (!sessionCookie) {
    throw new Error('mes_session cookie missing from login response');
  }

  return {
    cookie: sessionCookie,
    allCookies: cookiePairs.join('; '),
  };
}

export async function loginWithFallback(
  baseUrl: string,
  candidates: Array<{ username: string; password: string }>
): Promise<LoginResult> {
  let lastErr: Error | null = null;
  for (const c of candidates) {
    try {
      return await loginAndGetCookie(baseUrl, c.username, c.password);
    } catch (err) {
      lastErr = err as Error;
    }
  }
  throw lastErr ?? new Error('All login candidates failed');
}
