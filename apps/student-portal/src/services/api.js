import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://13.204.119.15:8000";

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (status === 401) {
      delete api.defaults.headers.common.Authorization;
      localStorage.removeItem("proctor_student_token");
      localStorage.removeItem("proctor_student_email");
      localStorage.removeItem("proctor_active_session");
      window.dispatchEvent(new Event("proctor-student-unauthorized"));
    }
    return Promise.reject(error);
  }
);

export const setAuthToken = (token) => {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
    return;
  }
  delete api.defaults.headers.common.Authorization;
};
