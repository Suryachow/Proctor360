import { useEffect, useState } from "react";
import LoginPage from "./pages/LoginPage";
import ExamPage from "./pages/ExamPage";
import StudentDashboardPage from "./pages/StudentDashboardPage";
import { setAuthToken } from "./services/api";

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("proctor_student_token") || "");
  const [email, setEmail] = useState(localStorage.getItem("proctor_student_email") || "");
  const [view, setView] = useState("dashboard");
  const [selectedExamCode, setSelectedExamCode] = useState("");
  const [latestReport, setLatestReport] = useState(null);

  useEffect(() => {
    if (token) {
      setAuthToken(token);
    }
  }, [token]);

  useEffect(() => {
    const onUnauthorized = () => {
      onLogout();
    };
    window.addEventListener("proctor-student-unauthorized", onUnauthorized);
    return () => window.removeEventListener("proctor-student-unauthorized", onUnauthorized);
  }, []);

  const onLogin = (nextToken, nextEmail) => {
    setToken(nextToken);
    setEmail(nextEmail);
    localStorage.setItem("proctor_student_token", nextToken);
    localStorage.setItem("proctor_student_email", nextEmail);
    setView("dashboard");
  };

  const onLogout = () => {
    setToken("");
    setEmail("");
    setSelectedExamCode("");
    setLatestReport(null);
    setView("dashboard");
    setAuthToken("");
    localStorage.removeItem("proctor_student_token");
    localStorage.removeItem("proctor_student_email");
    localStorage.removeItem("proctor_active_session");
  };

  const onTakeExam = (examCode) => {
    setSelectedExamCode(examCode || "");
    setView("exam");
  };

  if (!token) {
    return <LoginPage onLogin={onLogin} />;
  }

  if (view === "dashboard") {
    return (
      <StudentDashboardPage
        token={token}
        email={email}
        onTakeExam={onTakeExam}
        onLogout={onLogout}
        latestReport={latestReport}
      />
    );
  }

  return (
    <ExamPage
      token={token}
      email={email}
      selectedExamCode={selectedExamCode}
      onBackToDashboard={() => setView("dashboard")}
      onSubmitted={(payload) => {
        setLatestReport(payload?.report || null);
        setView("dashboard");
      }}
    />
  );
}
