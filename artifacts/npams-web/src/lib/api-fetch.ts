const REFRESH_LOCK_KEY = "npams_refresh_lock";

async function tryRefreshToken(): Promise<string | null> {
  if (sessionStorage.getItem(REFRESH_LOCK_KEY)) return null;
  sessionStorage.setItem(REFRESH_LOCK_KEY, "1");
  try {
    const refresh = localStorage.getItem("npams_refresh");
    if (!refresh) return null;
    const res = await fetch("/api/v1/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) {
      localStorage.removeItem("npams_token");
      localStorage.removeItem("npams_refresh");
      localStorage.removeItem("npams_user");
      localStorage.removeItem("npams_province_branding");
      return null;
    }
    const body = await res.json();
    const accessToken: string | null = body.data?.access_token ?? null;
    const newRefresh: string | null = body.data?.refresh_token ?? null;
    if (accessToken) localStorage.setItem("npams_token", accessToken);
    if (newRefresh) localStorage.setItem("npams_refresh", newRefresh);
    return accessToken;
  } finally {
    sessionStorage.removeItem(REFRESH_LOCK_KEY);
  }
}

export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = localStorage.getItem("npams_token");
  const activeAgencyId = localStorage.getItem("npams_active_agency_id");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(activeAgencyId && activeAgencyId !== "all" ? { "x-active-agency-id": activeAgencyId } : {}),
    ...(options.headers as Record<string, string> | undefined ?? {}),
  };

  let res = await fetch(path, { ...options, headers });

  if (res.status === 401) {
    const newToken = await tryRefreshToken();
    if (newToken) {
      headers["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(path, { ...options, headers });
    }
  }

  return res;
}

export async function apiFetchJson<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; status: number; data: T | null; message: string }> {
  try {
    const res = await apiFetch(path, options);
    const body = await res.json().catch(() => ({ message: "Unexpected error" }));
    return {
      ok: res.ok,
      status: res.status,
      data: res.ok ? (body as { data?: T }).data ?? (body as T) : null,
      message: (body as { message?: string }).message ?? (res.ok ? "Success" : "Request failed"),
    };
  } catch (err: unknown) {
    return {
      ok: false,
      status: 0,
      data: null,
      message: err instanceof Error ? err.message : "Network error",
    };
  }
}
