import { useState } from "react";
import { api, setAuthToken } from "../services/api";

const hashDevice = async () => {
  const raw = `${navigator.userAgent}|${navigator.language}|${screen.width}x${screen.height}`;
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
};

export default function LoginPage({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("student@test.com");
  const [password, setPassword] = useState("Student123!");
  const [error, setError] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setIsSyncing(true);
    try {
      const device_hash = await hashDevice();
      const normalizedEmail = email.trim().toLowerCase();
      const path = mode === "login" ? "/auth/login" : "/auth/register";
      const payload = mode === "register" ? { email: normalizedEmail, password, device_hash, live_image_base64: "" } : { email: normalizedEmail, password, device_hash };
      const { data } = await api.post(path, payload);
      setAuthToken(data.access_token);
      onLogin(data.access_token, normalizedEmail);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (Array.isArray(detail)) {
        setError(detail[0]?.msg || "Validation failed");
      } else {
        setError(detail || "Authentication failed");
      }
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div style={{
      height: "100vh",
      width: "100vw",
      display: "flex",
      overflow: "hidden",
      backgroundColor: "#000",
      fontFamily: "'Inter', sans-serif"
    }}>
      {/* ── LEFT SECTION (FORM) ── */}
      <section style={{
        flex: "0 0 40%",
        display: "flex",
        flexDirection: "column",
        padding: "80px",
        justifyContent: "center",
        backgroundColor: "#000",
        color: "#fff",
        zIndex: 2,
        borderRight: "1px solid rgba(255,255,255,0.25)" // INCREASED DIVIDER CONTRAST
      }}>
        <div style={{ marginBottom: "60px" }}>
           <div style={{ display: "flex", alignItems: "center", gap: "10px", opacity: 1 }}> {/* FULL CONTRAST BRANDING */}
             <div style={{ width: "22px", height: "22px", background: "#fff", borderRadius: "4px" }}></div>
             <span style={{ fontWeight: 900, fontSize: "0.75rem", letterSpacing: "2.5px", textTransform: "uppercase" }}>Proctor360</span>
           </div>
        </div>

        <div style={{ maxWidth: "340px", width: "100%" }}>
          <h1 style={{ fontSize: "3.8rem", fontWeight: 900, marginBottom: "40px", marginTop: 0, letterSpacing: "-2.5px" }}>
            {mode === "login" ? "Sign In" : "Register"}
          </h1>

          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
            {/* EMAIL / USER NAME */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <label style={{ fontSize: "0.9rem", fontWeight: 700, color: "#E2E8F0" }}>User Name</label> {/* BRIGHTER LABEL */}
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)", color: "#3B82F6" }}>
                  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="m22 6-10 7L2 6"/></svg>
                </span>
                <input 
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email or Username"
                  style={{
                    width: "100%",
                    padding: "18px 16px 18px 48px",
                    backgroundColor: "transparent",
                    border: "1px solid #4B5563", // BRIGHTER BORDER
                    borderRadius: "10px",
                    color: "#fff",
                    fontSize: "1rem",
                    outline: "none",
                    boxSizing: "border-box"
                  }}
                />
              </div>
            </div>

            {/* PASSWORD */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <label style={{ fontSize: "0.9rem", fontWeight: 700, color: "#E2E8F0" }}>Password</label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }}>
                  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </span>
                <input 
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter Password"
                  style={{
                    width: "100%",
                    padding: "18px 16px 18px 48px",
                    backgroundColor: "transparent",
                    border: "1px solid #4B5563", // BRIGHTER BORDER
                    borderRadius: "10px",
                    color: "#fff",
                    fontSize: "1rem",
                    outline: "none",
                    boxSizing: "border-box"
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <button type="button" style={{ background: "none", border: "none", color: "#9CA3AF", fontSize: "0.8rem", fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "1px" }}>Forgot Password?</button>
            </div>

            {error && (
              <div style={{ color: "#ef4444", fontSize: "0.75rem", fontWeight: 600, textAlign: "left" }}>
                {String(error).toUpperCase()}
              </div>
            )}

            <button 
              type="submit"
              disabled={isSyncing}
              style={{
                width: "100%",
                padding: "18px",
                backgroundColor: "#3B82F6",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                fontSize: "0.85rem",
                fontWeight: 800,
                cursor: "pointer",
                marginTop: "12px",
                transition: "0.2s",
                opacity: isSyncing ? 0.7 : 1,
                boxShadow: "0 10px 15px -3px rgba(59, 130, 246, 0.3)"
              }}
            >
              {isSyncing ? "SYNCING..." : (mode === "login" ? "SIGN IN" : "CREATE ACCOUNT")}
            </button>
          </form>

          <div style={{ marginTop: "40px", textAlign: "left" }}>
            <span style={{ color: "#9ca3af", fontSize: "0.85rem" }}>
              {mode === "login" ? "Don't have an account? " : "Already have an account? "}
              <button 
                onClick={() => setMode(mode === "login" ? "register" : "login")}
                style={{ background: "none", border: "none", color: "#fff", fontWeight: 600, cursor: "pointer", padding: 0, textDecoration: "underline" }}
              >
                {mode === "login" ? "Sign up" : "Sign in"}
              </button>
            </span>
          </div>
        </div>
      </section>

      {/* ── RIGHT SECTION (VISUAL) ── */}
      <section style={{
        flex: "1",
        position: "relative",
        backgroundImage: "url('/auth_bg.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}>
        {/* DARK OVERLAY */}
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0,0,0,0.4)",
          background: "linear-gradient(90deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.2) 100%)",
          zIndex: 1
        }} />

        <div style={{ position: "relative", zIndex: 2, padding: "80px", maxWidth: "480px" }}>
          <h2 style={{ color: "#fff", fontSize: "1.8rem", fontWeight: 500, lineHeight: 1.4, marginBottom: "20px" }}>
            A new way to experience AI proctoring in the infinite virtual space.
          </h2>
          <button style={{ 
            background: "none", 
            border: "none", 
            borderBottom: "2px solid #fff", 
            color: "#fff", 
            fontWeight: 700, 
            fontSize: "0.8rem", 
            paddingBottom: "4px", 
            cursor: "pointer", 
            textTransform: "uppercase", 
            letterSpacing: "1px" 
          }}>Learn More</button>
        </div>

        {/* MOUSE SCROLL ICON (DECORATIVE) */}
        <div style={{ position: "absolute", bottom: "40px", right: "40px", zIndex: 2, color: "#fff", opacity: 0.5 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
        </div>
      </section>

      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        input:focus {
          border-color: #3B82F6 !important;
          background-color: rgba(59, 130, 246, 0.05) !important;
        }
        button:hover {
          filter: brightness(1.1);
        }
      `}} />
    </div>
  );
}
