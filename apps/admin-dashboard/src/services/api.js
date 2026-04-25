import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://13.204.119.15:8000";
const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL || "ws://13.204.119.15:8000";
const ADMIN_TOKEN_KEY = "proctor_admin_token";

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
});

const decodeJwtPayload = (token) => {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
};

export const isUsableAdminToken = (token) => {
  if (!token || typeof token !== "string") return false;
  const payload = decodeJwtPayload(token);
  if (!payload) return false;

  const exp = Number(payload.exp || 0);
  const role = String(payload.role || "").toLowerCase();
  if (!Number.isFinite(exp) || role !== "admin") return false;

  const nowSeconds = Math.floor(Date.now() / 1000);
  return exp > nowSeconds + 10;
};

export const getStoredAdminToken = () => {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY) || "";
  if (isUsableAdminToken(token)) return token;
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  return "";
};

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (status === 401) {
      delete api.defaults.headers.common.Authorization;
      localStorage.removeItem(ADMIN_TOKEN_KEY);
      window.dispatchEvent(new Event("proctor-admin-unauthorized"));
    }
    return Promise.reject(error);
  }
);

export const setAdminToken = (token) => {
  if (isUsableAdminToken(token)) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
    return;
  }
  delete api.defaults.headers.common.Authorization;
  localStorage.removeItem(ADMIN_TOKEN_KEY);
};

// Initialize token from localStorage on app load
const storedToken = getStoredAdminToken();
if (storedToken) {
  api.defaults.headers.common.Authorization = `Bearer ${storedToken}`;
}
export const createAdminSocket = (token) => {
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  return new WebSocket(`${WS_BASE_URL}/ws/admin${query}`);
};
