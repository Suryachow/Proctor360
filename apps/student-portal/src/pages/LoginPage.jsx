import { useEffect, useRef, useState } from "react";
import { api, setAuthToken } from "../services/api";

function UiIcon({ name }) {
  const common = {
    className: "icon-svg",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };

  if (name === "camera") {
    return (
      <svg {...common}>
        <path d="M4 8h3l2-2h6l2 2h3v10H4z" />
        <circle cx="12" cy="13" r="3.5" />
      </svg>
    );
  }

  if (name === "capture") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="7" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M5 12h14" />
    </svg>
  );
}

const hashDevice = async () => {
  const raw = `${navigator.userAgent}|${navigator.language}|${screen.width}x${screen.height}`;
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

export default function LoginPage({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("student@example.com");
  const [password, setPassword] = useState("Password123!");
  const [error, setError] = useState("");
  const [liveImage, setLiveImage] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraReady(true);
    } catch {
      setError("Unable to access camera for live registration image");
    }
  };

  const captureLiveImage = () => {
    if (!videoRef.current || !canvasRef.current) {
      setError("Camera is not ready");
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video.videoWidth || !video.videoHeight) {
      setError("Video is not ready yet. Please wait a second and try again.");
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setLiveImage(canvas.toDataURL("image/jpeg", 0.9));
    setError("");
  };

  useEffect(() => {
    if (mode !== "register") {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setCameraReady(false);
      setLiveImage("");
    }
  }, [mode]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setError("");

    try {
      const device_hash = await hashDevice();
      const normalizedEmail = email.trim().toLowerCase();
      const path = mode === "login" ? "/auth/login" : "/auth/register";
      if (mode === "register" && !liveImage) {
        setError("Capture your live image before registering");
        return;
      }

      const payload =
        mode === "register"
          ? { email: normalizedEmail, password, device_hash, live_image_base64: liveImage }
          : { email: normalizedEmail, password, device_hash };

      const { data } = await api.post(path, payload);
      setAuthToken(data.access_token);
      onLogin(data.access_token, normalizedEmail);
    } catch (err) {
      setError(err?.response?.data?.detail || "Authentication failed");
    }
  };

  return (
    <div className="login-split-shell">
      {/* ── Left Auth Panel ── */}
      <section className="auth-left-panel">
        <div className="auth-form-container">
          <header>
            <div style={{ marginBottom: "40px", display: "flex", alignItems: "center", gap: "10px" }}>
               <div style={{ width: "24px", height: "24px", background: "#000", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ width: "8px", height: "8px", background: "#fff", borderRadius: "50%" }}></div>
               </div>
               <span style={{ fontWeight: 800, fontSize: "0.85rem", letterSpacing: "2px" }}>PROCTOR360</span>
            </div>
            <h1>Welcome back</h1>
            <p className="welcome-sub">Enter your credentials to access your secure proctoring node.</p>
          </header>

          <div className="minimal-tabs">
            <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Login</button>
            <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>Register</button>
          </div>

          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column" }}>
            <div className="form-group">
              <label>Corporate Identity</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="name@infrastructure.net" />
            </div>
            <div className="form-group">
              <label>Secure Access Token</label>
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required placeholder="••••••••••••" />
            </div>
            
            {mode === "register" ? (
              <div className="bio-box-clean">
                <label style={{ marginBottom: "16px", display: "block" }}>Biometric Signature Capture</label>
                <video ref={videoRef} autoPlay muted playsInline className="video-preview-clean" />
                <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                  <button type="button" className="btn-white" style={{ flex: 1, padding: "12px", fontSize: "0.8rem" }} onClick={startCamera}>
                    Sensor: Init
                  </button>
                  <button type="button" className="btn-black" style={{ flex: 1, padding: "12px", fontSize: "0.8rem" }} onClick={captureLiveImage} disabled={!cameraReady}>
                    Finalize Scan
                  </button>
                </div>
                {liveImage ? <div style={{ color: "#065f46", fontSize: "0.8rem", marginTop: "12px", border: "1px solid #d1fae5", padding: "10px", borderRadius: "8px", background: "#f0fdf4" }}>
                   ● Identity signature captured successfully.
                </div> : null}
              </div>
            ) : null}
            
            {error ? (
              <div style={{ marginBottom: "24px", padding: "14px", background: "#fef2f2", border: "1px solid #fee2e2", color: "#b91c1c", fontSize: "0.85rem", borderRadius: "8px", fontWeight: 700 }}>
                {error.toUpperCase()}
              </div>
            ) : null}
            
            <div>
              <button className="btn-black" type="submit" style={{ padding: "20px" }}>
                {mode === "login" ? "Authorise Candidate Entry" : "Finalise Registry"}
              </button>
              <button className="btn-white" type="button" onClick={() => window.location.reload()} style={{ padding: "16px" }}>Cancel</button>
            </div>
          </form>
          
          <footer className="auth-footer-text">
            © PROCTOR360 GLOBAL • CORPORATE ASSESSMENT 2024
          </footer>
        </div>
      </section>

      {/* ── Right Cinematic Area ── */}
      <section className="auth-right-panel">
        <div className="infra-container-glass">
            <img src="/proctoring_map.png" className="infra-image-glass" alt="Proctoring Ecosystem" />
        </div>
      </section>
    </div>
  );
}
