import { API_BASE_URL } from "../config";

async function request(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    throw new Error(payload?.detail || "Request failed");
  }

  return payload;
}

export const api = {
  login: (data) => request("/auth/login", { method: "POST", body: data }),
  getDashboardSummary: (token) => request("/dashboard/summary", { token }),
  getLowStock: (token) => request("/inventory/alerts/low-stock", { token }),
  getInventoryItems: (token) => request("/inventory/items", { token }),
  getByCode: (token, code) => request(`/inventory/by-code/${encodeURIComponent(code)}`, { token }),
  scanIncrease: (token, data) => request("/inventory/scan-increase", { method: "POST", token, body: data }),
  scanUpsert: (token, data) => request("/catalog/scan-upsert", { method: "POST", token, body: data }),
  checkout: (token, data) => request("/sales/checkout", { method: "POST", token, body: data })
};
