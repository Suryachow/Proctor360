import { api } from "../services/api";

export const Phase1Extensions = {
  async getExamReport(sessionId) {
    if (!sessionId) {
      return null;
    }

    try {
      const { data } = await api.get(`/exam/report/${sessionId}`);
      return data;
    } catch (error) {
      console.error("Failed to load exam report:", error);
      return null;
    }
  },

  async getStoredReports() {
    try {
      const { data } = await api.get("/exam/reports");
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error("Failed to load stored reports:", error);
      return [];
    }
  },

  async getProctorReport(sessionId) {
    if (!sessionId) {
      return null;
    }

    try {
      const { data } = await api.get(`/admin/proctor-report/${sessionId}`);
      return data;
    } catch (error) {
      console.error("Failed to load proctor report:", error);
      return null;
    }
  }
};

export default Phase1Extensions;
