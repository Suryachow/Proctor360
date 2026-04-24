import { useEffect, useRef, useState } from "react";
import { api } from "../services/api";

// Keep the key pool external; do not commit live API keys.
const GROQ_KEYS = [
  ...(String(import.meta.env.VITE_GROQ_API_KEYS || "").split(",") || []),
  import.meta.env.VITE_GROQ_API_KEY,
]
  .map((key) => String(key || "").trim())
  .filter(Boolean);
let keyIdx = 0;
const getNextKey = () => {
  if (!GROQ_KEYS.length) {
    return "";
  }
  const k = GROQ_KEYS[keyIdx];
  keyIdx = (keyIdx + 1) % GROQ_KEYS.length;
  return k;
};

// ── System prompt (ported from exam_generator.html) ──────────────────────────
const buildSystemPrompt = () =>
  `You are an AI-powered Exam Question Generator. Generate high-quality MCQs for an online exam platform. Your output MUST be strictly valid JSON only — no markdown, no commentary, no code fences.

Output Format:
{
  "exam_title": "...",
  "questions": [
    {
      "id": 1,
      "type": "mcq" | "diagram_mcq" | "graph_mcq",
      "question": "...",
      "diagram": "..." (null if not applicable),
      "options": {"A": "...", "B": "...", "C": "...", "D": "..."},
      "correct_answer": "A"|"B"|"C"|"D",
      "explanation": "...",
      "difficulty": "...",
      "marks": 1|2
    }
  ]
}

Rules:
- At least 40% of questions must be diagram_mcq or graph_mcq
- diagram field must not be null for diagram/graph types; use ONLY strictly valid Mermaid.js syntax. You may ONLY use 'flowchart TD', 'flowchart LR', or 'pie'. Do NOT wrap in markdown blocks. You MUST use the explicit '\\n' character to separate statements. NEVER use parentheses "()", brackets "[]", or quotes inside node text. Do not leave incomplete trailing arrows at the end of lines. Keep diagrams extremely simple (e.g. A-->B). Do not use ASCII art.
- Difficulty mapping: easy=1 mark direct concept; medium=1-2 marks multi-step; hard/expert=2 marks tricky logic
- All distractors must be realistic and based on common student mistakes
- Explanations: 2-4 lines, explain why correct, hint at wrong option mistakes
- Only ONE correct answer per question, no ambiguity
- Exam title: auto-generate from topics unless user provides one
- Return ONLY the JSON object`;

// ── Difficulty label colours ──────────────────────────────────────────────────
const DIFF_COLORS = {
  easy: { bg: "#d4edda", color: "#155724", border: "#28a745" },
  medium: { bg: "#fff3cd", color: "#856404", border: "#ffc107" },
  hard: { bg: "#fde2e4", color: "#721c24", border: "#e63946" },
  expert: { bg: "#1a1a2e", color: "#f4a261", border: "#1a1a2e" },
};

const TYPE_COLORS = {
  mcq: { bg: "#e8f4fd", color: "#0369a1" },
  diagram_mcq: { bg: "#fef3e2", color: "#c2410c" },
  graph_mcq: { bg: "#f0fdf4", color: "#166534" },
};

let mermaidRuntimePromise = null;
const getMermaidRuntime = async () => {
  if (!mermaidRuntimePromise) {
    mermaidRuntimePromise = import("https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs")
      .then((module) => {
        module.default.initialize({ startOnLoad: false, theme: "default" });
        return module.default;
      })
      .catch(() => null);
  }
  return mermaidRuntimePromise;
};

const isValidOptionSet = (options) => {
  const keys = ["A", "B", "C", "D"];
  return keys.every((k) => typeof options?.[k] === "string" && options[k].trim().length > 0);
};

const normalizeQuestion = (q, fallbackDifficulty) => {
  const type = ["mcq", "diagram_mcq", "graph_mcq"].includes(q?.type) ? q.type : "mcq";
  const question = String(q?.question || "").trim();
  const diagram = typeof q?.diagram === "string" ? q.diagram.trim() : "";
  const options = q?.options || {};
  const correct = String(q?.correct_answer || "A").toUpperCase();
  const difficulty = String(q?.difficulty || fallbackDifficulty || "medium").toLowerCase();
  const marks = Number(q?.marks) === 2 ? 2 : 1;

  if (!question || !isValidOptionSet(options) || !["A", "B", "C", "D"].includes(correct)) {
    return null;
  }

  return {
    id: Number(q?.id) || 0,
    type,
    question,
    diagram,
    options: {
      A: String(options.A).trim(),
      B: String(options.B).trim(),
      C: String(options.C).trim(),
      D: String(options.D).trim(),
    },
    correct_answer: correct,
    explanation: String(q?.explanation || "").trim(),
    difficulty,
    marks,
  };
};

const validateDiagramQuestion = async (question) => {
  const hasDiagramType = question.type === "diagram_mcq" || question.type === "graph_mcq";
  if (!hasDiagramType && !question.diagram) return { valid: true };
  if (!question.diagram) return { valid: false, reason: "missing-diagram" };

  const mermaid = await getMermaidRuntime();
  if (!mermaid) {
    // If runtime import fails, keep question to avoid hard-blocking generation.
    return { valid: true };
  }

  try {
    await mermaid.parse(question.diagram);
    return { valid: true };
  } catch {
    return { valid: false, reason: "invalid-diagram" };
  }
};

// ── Convert exam_generator rich format → backend flat format ─────────────────
function toBackendFormat(question, topic) {
  const opts = question.options || {};
  // Embed diagram marker in prompt if present
  let prompt = question.question || "";
  if (question.diagram) {
    prompt = `${prompt}\n[[DIAGRAM_MERMAID]]${question.diagram}\n[[DIAGRAM_ALT]]Diagram for ${topic} question`;
  }
  return {
    prompt,
    option_a: opts.A || "",
    option_b: opts.B || "",
    option_c: opts.C || "",
    option_d: opts.D || "",
    correct_option: question.correct_answer || "A",
    topic: topic.toLowerCase(),
    sub_topic: (question.sub_topic || "general").toLowerCase(),
  };
}

// ── Mermaid renderer helper ───────────────────────────────────────────────────
function MermaidDiagram({ code, id }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !code) return;
    const render = async () => {
      try {
        const mermaid = await import("https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs");
        mermaid.default.initialize({ startOnLoad: false, theme: "default" });
        const { svg } = await mermaid.default.render(`mermaid-${id}`, code);
        const hasSyntaxError =
          typeof svg === "string" &&
          (svg.toLowerCase().includes("syntax error in text") || svg.toLowerCase().includes("mermaid version"));
        if (ref.current) {
          ref.current.innerHTML = hasSyntaxError
            ? `<div style=\"font-size:0.78rem;color:#475569;padding:0.7rem;border:1px dashed rgba(10,10,15,0.2);border-radius:8px;background:#fff;\">Diagram preview unavailable for this question.</div>`
            : svg;
        }
      } catch {
        if (ref.current) {
          ref.current.innerHTML = `<div style=\"font-size:0.78rem;color:#475569;padding:0.7rem;border:1px dashed rgba(10,10,15,0.2);border-radius:8px;background:#fff;\">Diagram preview unavailable for this question.</div>`;
        }
      }
    };
    render();
  }, [code, id]);
  return <div ref={ref} style={{ background: "#f8f7f2", borderRadius: 8, padding: "0.75rem", marginBottom: "0.75rem", border: "1px solid rgba(10,10,15,0.1)" }} />;
}

// ── Question Card ────────────────────────────────────────────────────────────
function QuestionCard({ q, index }) {
  const [expanded, setExpanded] = useState(true);
  const diffStyle = DIFF_COLORS[q.difficulty] || DIFF_COLORS.medium;
  const typeStyle = TYPE_COLORS[q.type] || TYPE_COLORS.mcq;

  return (
    <div className="mcq-card" style={{ border: "1.5px solid rgba(10,10,15,0.12)", borderRadius: 16, background: "#fff", overflow: "hidden", marginBottom: "1rem" }}>
      {/* Card header */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.7rem", padding: "0.8rem 1.1rem", background: "#fafafa", borderBottom: "1px solid rgba(10,10,15,0.08)", cursor: "pointer" }} onClick={() => setExpanded(e => !e)}>
        <span style={{ background: "#0a0a0f", color: "#fff", borderRadius: 7, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.8rem", flexShrink: 0 }}>{index + 1}</span>
        <span style={{ ...typeStyle, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.18rem 0.6rem", borderRadius: 100 }}>{q.type}</span>
        <span style={{ marginLeft: "auto", ...diffStyle, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", padding: "0.18rem 0.65rem", borderRadius: 100 }}>{q.difficulty}</span>
        <span style={{ fontSize: "0.65rem", color: "rgba(10,10,15,0.4)", marginLeft: "0.5rem" }}>{q.marks}mk</span>
        <span style={{ fontSize: "0.75rem", color: "rgba(10,10,15,0.35)", marginLeft: "0.5rem" }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div style={{ padding: "1rem 1.1rem" }}>
          {/* Question text */}
          <p style={{ fontFamily: "'Georgia', serif", fontSize: "1rem", color: "#0a0a0f", lineHeight: 1.65, marginBottom: "0.9rem" }}>{q.question}</p>

          {/* Diagram */}
          {q.diagram && <MermaidDiagram code={q.diagram} id={`q-${index}`} />}

          {/* Options */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "0.9rem" }}>
            {Object.entries(q.options || {}).map(([key, val]) => {
              const isCorrect = key === q.correct_answer;
              return (
                <div key={key} style={{ display: "flex", alignItems: "flex-start", gap: "0.6rem", padding: "0.65rem 0.85rem", borderRadius: 10, border: isCorrect ? "1.5px solid #28a745" : "1.5px solid rgba(10,10,15,0.12)", background: isCorrect ? "#d4edda" : "transparent", color: isCorrect ? "#155724" : "rgba(10,10,15,0.7)", fontSize: "0.8rem", lineHeight: 1.5 }}>
                  <span style={{ fontWeight: 600, minWidth: 14 }}>{key}.</span>
                  <span>{val}</span>
                </div>
              );
            })}
          </div>

          {/* Explanation */}
          {q.explanation && (
            <div style={{ padding: "0.8rem 1rem", background: "linear-gradient(135deg, #fef9f0, #fff)", border: "1px solid rgba(244,162,97,0.3)", borderRadius: 10 }}>
              <div style={{ fontSize: "0.62rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#f4a261", marginBottom: "0.3rem" }}>Explanation</div>
              <p style={{ fontSize: "0.76rem", color: "rgba(10,10,15,0.65)", lineHeight: 1.65, margin: 0 }}>{q.explanation}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main MCQGenerator Component ───────────────────────────────────────────────
export default function MCQGenerator({ onExamPublished }) {
  const [topics, setTopics] = useState("");
  const [qty, setQty] = useState(8);
  const [difficulty, setDifficulty] = useState("medium");
  const [examType, setExamType] = useState("Technology (FAANG/LeetCode)");
  const [customTitle, setCustomTitle] = useState("");
  const [generating, setGenerating] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [exam, setExam] = useState(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState({ msg: "", type: "" });
  const [publishing, setPublishing] = useState(false);
  const [publishedResult, setPublishedResult] = useState(null);
  const [audience, setAudience] = useState("public");
  const [studentEmails, setStudentEmails] = useState("");
  const [examCode, setExamCode] = useState("");

  const SYLLABUS_MAP = {
    "Technology (FAANG/LeetCode)": "Data Structures, Algorithms, System Design, Time Complexity, OS Fundamentals",
    "UPSC (Civil Services/IAS)": "Indian Polity, Ancient & Modern History, Geography, Economics, International Relations, CSAT",
    "State Groups (Group 1/2/3)": "General Studies, Mental Ability, Disaster Management, Regional History, Current Affairs",
    "Professional Certifications (AWS/GCP)": "Cloud Architecture, Security & Compliance, Compute Services, Storage Solutions, VPC Networking"
  };

  const autoFillSyllabus = () => {
    setTopics(SYLLABUS_MAP[examType] || "");
    showToast(`✓ Loaded official ${examType} blueprint!`);
  };
  const loadingRef = useRef(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: "", type: "" }), 3500);
  };

  const LOADING_MSGS = [
    "Briefing the AI professor…",
    "Crafting clever distractors…",
    "Forging exam questions…",
    "Double-checking answers…",
    "Building Mermaid diagrams…",
  ];

  const fetchGroqExamBatch = async (questionCount) => {
    const systemPrompt = buildSystemPrompt();
    const userPrompt = `Generate ${questionCount} MCQ questions for the ${examType} competitive track.
Topics: ${topics || "USE OFFICIAL STANDARD SYLLABUS FOR THIS EXAM TYPE"}
Difficulty: ${difficulty}
IMPORTANT: If topics are not provided, strictly follow the ${examType} official exam pattern and syllabus breakdown.
Provide a granular "sub_topic" for each question.
${customTitle ? `\nExam title: ${customTitle}` : ""}
\n\nReturn ONLY valid JSON, no markdown.`;

    if (!GROQ_KEYS.length) {
      throw new Error("Add VITE_GROQ_API_KEY or VITE_GROQ_API_KEYS to continue.");
    }

    let lastError = null;
    for (let attempt = 0; attempt < GROQ_KEYS.length; attempt += 1) {
      const apiKey = getNextKey();
      try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
          }),
        });

        if (res.status === 429) {
          lastError = new Error("Groq rate limit (429). Trying next key.");
          continue;
        }
        if (!res.ok) {
          lastError = new Error(`Groq API error: ${res.status}. Trying next key.`);
          continue;
        }

        const data = await res.json();
        const raw = data?.choices?.[0]?.message?.content || "";
        const clean = raw.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(clean);

        if (!Array.isArray(parsed?.questions)) {
          lastError = new Error("AI returned invalid question format. Trying next key.");
          continue;
        }

        return {
          examTitle: String(parsed?.exam_title || customTitle || `${topics} Assessment`).trim(),
          questions: parsed.questions,
        };
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error("Groq API error: all configured keys failed.");
  };

  const generateWithDiagramAutoRepair = async () => {
    const desiredCount = Number(qty);
    const maxAttempts = 4;
    const kept = [];
    const seenQuestions = new Set();
    let title = customTitle || `${topics} Assessment`;
    let removedForDiagram = 0;

    for (let attempt = 0; attempt < maxAttempts && kept.length < desiredCount; attempt += 1) {
      const missing = desiredCount - kept.length;
      const requestCount = Math.max(missing, Math.min(6, desiredCount));
      const batch = await fetchGroqExamBatch(requestCount);
      if (batch.examTitle) {
        title = batch.examTitle;
      }

      for (const rawQuestion of batch.questions) {
        const normalized = normalizeQuestion(rawQuestion, difficulty);
        if (!normalized) continue;

        const key = normalized.question.toLowerCase();
        if (seenQuestions.has(key)) continue;

        const diagramCheck = await validateDiagramQuestion(normalized);
        if (!diagramCheck.valid) {
          removedForDiagram += 1;
          continue;
        }

        seenQuestions.add(key);
        kept.push(normalized);
        if (kept.length >= desiredCount) break;
      }
    }

    if (kept.length < desiredCount) {
      throw new Error("Could not generate enough valid questions with previewable diagrams. Try again.");
    }

    return {
      exam_title: title,
      questions: kept.slice(0, desiredCount),
      removedForDiagram,
    };
  };

  const generate = async () => {
    if (!topics.trim()) { setError("Please enter at least one topic."); return; }
    setError("");
    setExam(null);
    setPublishedResult(null);
    setGenerating(true);

    let mi = 0;
    setLoadingMsg(LOADING_MSGS[0]);
    loadingRef.current = setInterval(() => {
      mi = (mi + 1) % LOADING_MSGS.length;
      setLoadingMsg(LOADING_MSGS[mi]);
    }, 1800);

    try {
      const parsed = await generateWithDiagramAutoRepair();
      setExam(parsed);
      if (parsed.removedForDiagram > 0) {
        showToast(`✓ ${parsed.questions.length} questions generated. Replaced ${parsed.removedForDiagram} invalid diagram questions.`);
      } else {
        showToast(`✓ ${parsed.questions.length} questions generated!`);
      }
    } catch (err) {
      setError(err.message || "Generation failed. Check your network and retry.");
    } finally {
      clearInterval(loadingRef.current);
      setGenerating(false);
      setLoadingMsg("");
    }
  };

  const publishToBackend = async () => {
    if (!exam) return;

    if (audience === "private") {
      const emails = studentEmails.split(/[\n,]/).map(e => e.trim()).filter(Boolean);
      if (!emails.length) { setError("Add at least one student email for a private exam."); return; }
    }

    setError("");
    setPublishing(true);
    try {
      // 1 — Bulk upload questions to backend
      const backendQs = exam.questions.map(q => toBackendFormat(q, topics || "general"));
      const uploadRes = await api.post("/admin/questions/bulk", { questions: backendQs });
      const questionIds = uploadRes.data.question_ids || [];

      // 2 — Create exam with those IDs
      const emails = audience === "private"
        ? studentEmails.split(/[\n,]/).map(e => e.trim().toLowerCase()).filter(Boolean)
        : [];

      const codeSlug = (examCode.trim() || exam.exam_title || topics)
        .toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 16);

      const examRes = await api.post("/admin/exams", {
        code: codeSlug,
        title: exam.exam_title || customTitle || `${topics} Assessment`,
        question_ids: questionIds,
        student_emails: emails,
      });

      setPublishedResult(examRes.data);
      showToast(`🎉 Exam ${examRes.data.exam_code} published! OTP: ${examRes.data.verification_code}`);
      if (onExamPublished) onExamPublished();
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || "Publish failed.");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <section style={{ maxWidth: 920, margin: "0 auto", padding: "2rem 1.5rem" }}>
      {/* Toast */}
      {toast.msg && (
        <div style={{ position: "fixed", bottom: 28, right: 28, zIndex: 9999, padding: "0.75rem 1.4rem", borderRadius: 12, background: toast.type === "error" ? "#e63946" : "#1a1a2e", color: "#fff", fontSize: "0.82rem", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", animation: "slideUp 0.3s ease" }}>
          {toast.msg}
        </div>
      )}

      {/* Loading overlay */}
      {generating && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(10,10,15,0.85)", zIndex: 999, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1.5rem" }}>
          <div style={{ width: 56, height: 56, border: "3px solid rgba(255,255,255,0.1)", borderTopColor: "#f4a261", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
          <p style={{ fontFamily: "monospace", color: "rgba(255,255,255,0.7)", fontSize: "0.85rem", letterSpacing: "0.08em" }}>{loadingMsg}</p>
        </div>
      )}

      {/* ── Config form ── */}
      <div className="panel" style={{ marginBottom: "2rem" }}>
        <div style={{ marginBottom: "1.5rem" }}>
          <p style={{ fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", color: "#e63946", marginBottom: "0.4rem" }}>AI MCQ Generator</p>
          <h2 style={{ margin: 0 }}>Generate Rich MCQ Questions</h2>
          <p className="panel-hint">Architect neural assessment clusters using GroQ-powered synthetic logic.</p>
        </div>

        <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          {/* Exam Type */}
          <div className="field-group" style={{ gridColumn: "1 / -1" }}>
            <label>Target Competitive Track</label>
            <select 
              value={examType} 
              onChange={e => setExamType(e.target.value)}
              style={{ width: "100%", padding: "16px", borderRadius: "14px", background: "#f9fafb", border: "1px solid var(--border)", fontInherit: "inherit" }}
            >
              <option>Technology (FAANG/LeetCode)</option>
              <option>UPSC (Civil Services/IAS)</option>
              <option>State Groups (Group 1/2/3)</option>
              <option>Professional Certifications (AWS/GCP)</option>
            </select>
          </div>

          {/* Topics */}
          <div className="field-group" style={{ gridColumn: "1 / -1" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
               <label>Topics <span style={{ opacity: 0.45 }}>(comma-separated)</span></label>
               <button 
                 type="button" 
                 onClick={autoFillSyllabus} 
                 style={{ border: "none", background: "none", color: "var(--primary)", fontSize: "0.7rem", fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>
                 💡 AI: Use Official Syllabus Blueprint
               </button>
            </div>
            <input
              id="mcq-topics"
              value={topics}
              onChange={e => setTopics(e.target.value)}
              placeholder={`e.g. ${SYLLABUS_MAP[examType]?.split(",")[0]}...`}
            />
          </div>

          {/* Difficulty */}
          <div className="field-group">
            <label>Difficulty</label>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {["easy", "medium", "hard", "expert"].map(d => {
                const dc = DIFF_COLORS[d];
                const active = difficulty === d;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDifficulty(d)}
                    style={{ padding: "0.45rem 1rem", borderRadius: 100, border: `1.5px solid ${active ? dc.border : "rgba(10,10,15,0.15)"}`, background: active ? dc.bg : "#fff", color: active ? dc.color : "rgba(10,10,15,0.5)", fontSize: "0.75rem", cursor: "pointer", textTransform: "capitalize", transition: "all 0.15s" }}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Question count */}
          <div className="field-group">
            <label>Number of Questions (1–20)</label>
            <div style={{ display: "flex", alignItems: "center", gap: 0, background: "#f8fafc", border: "1.5px solid rgba(10,10,15,0.1)", borderRadius: 12, overflow: "hidden", width: "fit-content" }}>
              <button type="button" onClick={() => setQty(v => Math.max(1, v - 1))} style={{ width: 44, height: 44, background: "none", border: "none", fontSize: "1.2rem", cursor: "pointer", color: "#0a0a0f", transition: "background 0.2s" }}>−</button>
              <input
                type="text"
                readOnly
                value={qty}
                style={{ width: 68, textAlign: "center", fontWeight: 800, fontSize: "1.1rem", border: "none", outline: "none", background: "transparent", color: "#0a0a0f", padding: 0 }}
              />
              <button type="button" onClick={() => setQty(v => Math.min(20, v + 1))} style={{ width: 44, height: 44, background: "none", border: "none", fontSize: "1.2rem", cursor: "pointer", color: "#0a0a0f", transition: "background 0.2s" }}>+</button>
            </div>
          </div>

          {/* Custom exam title */}
          <div className="field-group" style={{ gridColumn: "1 / -1" }}>
            <label>Custom Exam Title <span style={{ opacity: 0.45 }}>(optional – AI will auto-generate if left blank)</span></label>
            <input
              id="mcq-custom-title"
              value={customTitle}
              onChange={e => setCustomTitle(e.target.value)}
              placeholder="e.g. OS Fundamentals – Midterm 2026"
            />
          </div>
        </div>

        <button
          id="mcq-generate-btn"
          className="btn-with-icon btn-primary"
          onClick={generate}
          disabled={generating}
          style={{ marginTop: "1.2rem", width: "100%", padding: "0.9rem", justifyContent: "center", fontSize: "0.95rem", fontWeight: 700, letterSpacing: "0.02em" }}
        >
          <span>{generating ? "Generating…" : "⚡ Generate MCQ Questions"}</span>
        </button>

        {error && <p style={{ color: "#b23b3b", marginTop: "0.75rem", fontSize: "0.82rem" }}>{error}</p>}
      </div>

      {/* ── Results ── */}
      {exam && (
        <>
          {/* Stats bar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem", marginBottom: "1.5rem" }}>
            <div>
              <h3 style={{ margin: 0, fontFamily: "inherit" }}>{exam.exam_title}</h3>
              <div style={{ display: "flex", gap: "0.7rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                {[
                  ["Questions", exam.questions.length],
                  ["Total Marks", exam.questions.reduce((s, q) => s + (q.marks || 1), 0)],
                  ["Diagram/Graph", exam.questions.filter(q => q.type !== "mcq").length],
                  ["Difficulty", difficulty],
                ].map(([label, val]) => (
                  <span key={label} style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.3rem 0.8rem", background: "#fff", border: "1px solid rgba(10,10,15,0.1)", borderRadius: 8, fontSize: "0.72rem", color: "rgba(10,10,15,0.6)" }}>
                    {label}: <strong style={{ color: "#0a0a0f" }}>{val}</strong>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Question cards */}
          {exam.questions.map((q, i) => (
            <QuestionCard
              key={i}
              q={q}
              index={i}
            />
          ))}

          {/* Create exam panel */}
          <div className="panel" style={{ marginTop: "2rem" }}>
            <h2 style={{ marginTop: 0 }}>Create Exam + Generate OTP</h2>
            <p className="panel-hint">
              All generated questions will be uploaded to the backend question bank and bundled into a new exam.
            </p>

            <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
              <div className="field-group">
                <label>Exam Code <span style={{ opacity: 0.45 }}>(auto-generated if blank)</span></label>
                <input
                  id="mcq-exam-code"
                  value={examCode}
                  onChange={e => setExamCode(e.target.value)}
                  placeholder="e.g. OS-MID-2026"
                />
              </div>
              <div className="field-group">
                <label>Audience</label>
                <select value={audience} onChange={e => setAudience(e.target.value)}>
                  <option value="public">Public (all students)</option>
                  <option value="private">Private (specific students)</option>
                </select>
              </div>
            </div>

            {audience === "private" && (
              <div className="field-group" style={{ marginBottom: "1rem" }}>
                <label>Student Emails <span style={{ opacity: 0.45 }}>(comma or newline separated)</span></label>
                <textarea
                  rows={3}
                  value={studentEmails}
                  onChange={e => setStudentEmails(e.target.value)}
                  placeholder="student1@example.com, student2@example.com"
                  style={{ width: "100%" }}
                />
              </div>
            )}

            <button
              id="mcq-publish-btn"
              className="btn-with-icon btn-primary"
              onClick={publishToBackend}
              disabled={publishing}
              style={{ padding: "0.85rem 2rem", justifyContent: "center" }}
            >
              <span>{publishing ? "Creating Exam..." : "Create Exam + Generate OTP"}</span>
            </button>

            {error && <p style={{ color: "#b23b3b", marginTop: "0.75rem", fontSize: "0.82rem" }}>{error}</p>}

            {publishedResult && (
              <div className="otp-box" style={{ marginTop: "1rem" }}>
                <strong>✅ Exam {publishedResult.exam_code} created!</strong>
                <span>Title: {publishedResult.title || exam.exam_title}</span>
                <span>Visibility: {publishedResult.is_public ? "Public" : "Private"}</span>
                <span>Questions: {publishedResult.question_count}</span>
                <span style={{ fontWeight: 700, color: "#e63946" }}>OTP / Verification Code: {publishedResult.verification_code}</span>
              </div>
            )}
          </div>
        </>
      )}

      {/* Keyframes */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </section>
  );
}
