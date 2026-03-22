const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

export interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  error?: { message: string; code?: string };
  meta?: { page: number; per_page: number; total: number; total_pages: number };
}

async function request(
  method: string,
  path: string,
  options: { body?: any; token?: string; headers?: Record<string, string> } = {}
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...options.headers,
  };
  if (options.token) {
    headers["Authorization"] = `Bearer ${options.token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

export const api = {
  get: (path: string, token?: string) => request("GET", path, { token }),
  post: (path: string, body?: any, token?: string) => request("POST", path, { body, token }),
  put: (path: string, body?: any, token?: string) => request("PUT", path, { body, token }),
  delete: (path: string, token?: string) => request("DELETE", path, { token }),
};

export async function loginAs(
  email = "ananya@technova.in",
  password = "Welcome@123"
): Promise<{ token: string; refreshToken: string; user: any; org: any }> {
  const { body } = await api.post("/api/v1/auth/login", { email, password });
  if (!body.success) throw new Error(`Login failed: ${body.error?.message}`);
  return {
    token: body.data.tokens.access_token,
    refreshToken: body.data.tokens.refresh_token,
    user: body.data.user,
    org: body.data.org,
  };
}

let _cachedToken: string | null = null;

export async function getToken(): Promise<string> {
  if (_cachedToken) return _cachedToken;
  const { token } = await loginAs();
  _cachedToken = token;
  return token;
}

export function clearTokenCache() {
  _cachedToken = null;
}
