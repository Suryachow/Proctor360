import math
from collections import Counter
from datetime import datetime
from typing import Any

from fpdf import FPDF
from sqlalchemy.orm import Session

from app.models.entities import Exam, ExamAnswer, ExamQuestion, ExamSession, Question, Violation
from app.services.exam_report import build_exam_report


def _safe_text(value: Any) -> str:
    text = str(value or "")
    return text.encode("latin-1", "replace").decode("latin-1")


def _pdf_bytes(pdf: FPDF) -> bytes:
    raw = pdf.output(dest="S")
    if isinstance(raw, bytearray):
        return bytes(raw)
    if isinstance(raw, bytes):
        return raw
    return raw.encode("latin-1")


def _write_line(pdf: FPDF, text: Any, line_h: float = 4.5) -> None:
    pdf.set_x(10)
    pdf.multi_cell(190, line_h, _safe_text(text), new_x="LMARGIN", new_y="NEXT")


def _ensure_space(pdf: FPDF, needed_height: float) -> None:
    if pdf.get_y() + needed_height > (pdf.h - 12):
        pdf.add_page()


def _section_header(pdf: FPDF, title: str) -> None:
    _ensure_space(pdf, 10)
    pdf.set_fill_color(239, 246, 255)
    pdf.set_draw_color(191, 219, 254)
    pdf.rect(10, pdf.get_y(), 190, 7, style="DF")
    pdf.set_xy(12, pdf.get_y() + 1.2)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 5, _safe_text(title), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)


def _kv_grid(pdf: FPDF, rows: list[tuple[str, str]], col_width: float = 47.5) -> None:
    _ensure_space(pdf, 8 + (len(rows) // 2 + 1) * 7)
    x0 = 10
    y0 = pdf.get_y()
    row_h = 7

    for idx, (label, value) in enumerate(rows):
        row = idx // 2
        col = idx % 2
        x = x0 + (col * 95)
        y = y0 + (row * row_h)

        pdf.set_xy(x, y)
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_text_color(71, 85, 105)
        pdf.cell(col_width, row_h, _safe_text(label))

        pdf.set_font("Helvetica", "", 8.5)
        pdf.set_text_color(15, 23, 42)
        pdf.cell(col_width, row_h, _safe_text(value))

    total_rows = (len(rows) + 1) // 2
    pdf.set_y(y0 + (total_rows * row_h) + 1)


def _bar_chart(pdf: FPDF, title: str, items: list[tuple[str, float]]) -> None:
    _ensure_space(pdf, 56)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(30, 41, 59)
    pdf.cell(0, 5, _safe_text(title), new_x="LMARGIN", new_y="NEXT")

    x = 12
    label_w = 46
    bar_w = 112
    for name, value in items[:6]:
        v = max(0.0, min(100.0, float(value)))
        y = pdf.get_y() + 1
        pdf.set_xy(x, y)
        pdf.set_font("Helvetica", "", 8)
        pdf.cell(label_w, 5.8, _safe_text(name)[:24])
        pdf.set_fill_color(226, 232, 240)
        pdf.rect(x + label_w, y + 1.2, bar_w, 3.2, style="F")
        pdf.set_fill_color(37, 99, 235)
        pdf.rect(x + label_w, y + 1.2, bar_w * (v / 100.0), 3.2, style="F")
        pdf.set_xy(x + label_w + bar_w + 2, y)
        pdf.cell(16, 5.8, f"{v:.0f}%")
        pdf.ln(5.8)
    pdf.ln(1)


def _draw_pie_sector(pdf: FPDF, cx: float, cy: float, r: float, start_deg: float, end_deg: float) -> None:
    if end_deg <= start_deg:
        return
    points = [(cx, cy)]
    step = 6
    angle = start_deg
    while angle <= end_deg:
        rad = math.radians(angle)
        points.append((cx + (r * math.cos(rad)), cy + (r * math.sin(rad))))
        angle += step
    rad = math.radians(end_deg)
    points.append((cx + (r * math.cos(rad)), cy + (r * math.sin(rad))))
    pdf.polygon(points, style="F")


def _pie_chart(pdf: FPDF, title: str, correct: int, wrong: int, unanswered: int) -> None:
    _ensure_space(pdf, 50)
    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(0, 5, _safe_text(title), new_x="LMARGIN", new_y="NEXT")

    total = max(1, correct + wrong + unanswered)
    cx, cy, r = 48, pdf.get_y() + 18, 14

    slices = [
        (correct, (22, 163, 74), "Correct"),
        (wrong, (220, 38, 38), "Wrong"),
        (unanswered, (245, 158, 11), "Unanswered"),
    ]

    start = -90.0
    for amount, color, _ in slices:
        deg = 360.0 * (amount / total)
        pdf.set_fill_color(*color)
        _draw_pie_sector(pdf, cx, cy, r, start, start + deg)
        start += deg

    legend_x = 80
    legend_y = cy - 12
    pdf.set_font("Helvetica", "", 8)
    for idx, (amount, color, label) in enumerate(slices):
        y = legend_y + (idx * 8)
        pdf.set_fill_color(*color)
        pdf.rect(legend_x, y, 4, 4, style="F")
        pct = (amount / total) * 100.0
        pdf.set_xy(legend_x + 6, y - 1)
        pdf.cell(0, 6, f"{label}: {amount} ({pct:.1f}%)")

    pdf.set_y(cy + 16)


def _radar_chart(pdf: FPDF, title: str, skills: dict[str, float]) -> None:
    _ensure_space(pdf, 58)
    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(0, 5, _safe_text(title), new_x="LMARGIN", new_y="NEXT")

    labels = list(skills.keys())
    values = [max(0.0, min(100.0, float(skills[key]))) for key in labels]

    cx, cy, r = 146, pdf.get_y() + 22, 18
    n = len(labels)

    pdf.set_draw_color(203, 213, 225)
    for level in [0.25, 0.5, 0.75, 1.0]:
        ring = []
        for i in range(n):
            angle = -math.pi / 2 + (2 * math.pi * i / n)
            ring.append((cx + (r * level * math.cos(angle)), cy + (r * level * math.sin(angle))))
        pdf.polygon(ring, style="D")

    for i, label in enumerate(labels):
        angle = -math.pi / 2 + (2 * math.pi * i / n)
        ex = cx + (r * math.cos(angle))
        ey = cy + (r * math.sin(angle))
        pdf.line(cx, cy, ex, ey)
        lx = cx + ((r + 6) * math.cos(angle))
        ly = cy + ((r + 6) * math.sin(angle))
        pdf.set_xy(lx - 12, ly - 2)
        pdf.set_font("Helvetica", "", 7.5)
        pdf.cell(24, 4, _safe_text(label), align="C")

    poly = []
    for i, value in enumerate(values):
        angle = -math.pi / 2 + (2 * math.pi * i / n)
        rv = r * (value / 100.0)
        poly.append((cx + (rv * math.cos(angle)), cy + (rv * math.sin(angle))))

    pdf.set_fill_color(59, 130, 246)
    pdf.set_draw_color(37, 99, 235)
    pdf.polygon(poly, style="DF")
    pdf.set_y(cy + 22)


def _topic_strength(score: float) -> str:
    if score >= 75:
        return "Strong"
    if score >= 55:
        return "Moderate"
    return "Weak"


def _topic_insight(topic: str, score: float, unanswered: int) -> str:
    if score >= 75:
        return f"Confident in {topic}; maintain with mixed-variation drills."
    if unanswered > 0:
        return f"Gaps in {topic} mostly from skipped items; improve time allocation."
    return f"Weak understanding in {topic}; revise core rules then practice timed sets."


def _draw_learning_diagram(pdf: FPDF, title: str, nodes: list[str]) -> None:
    _ensure_space(pdf, 38)
    pdf.set_font("Helvetica", "B", 8.5)
    pdf.cell(0, 5, _safe_text(title), new_x="LMARGIN", new_y="NEXT")

    x = 14
    y = pdf.get_y() + 1
    w = 42
    h = 10
    gap = 5
    for idx, node in enumerate(nodes):
        nx = x + idx * (w + gap)
        pdf.set_fill_color(239, 246, 255)
        pdf.set_draw_color(147, 197, 253)
        pdf.rect(nx, y, w, h, style="DF")
        pdf.set_xy(nx + 1, y + 2.2)
        pdf.set_font("Helvetica", "", 7.5)
        pdf.cell(w - 2, 4, _safe_text(node)[:28], align="C")
        if idx < len(nodes) - 1:
            ax = nx + w
            ay = y + (h / 2)
            pdf.set_draw_color(59, 130, 246)
            pdf.line(ax, ay, ax + gap - 1.5, ay)
    pdf.set_y(y + h + 2)


def build_exam_report_pdf(db: Session, session: ExamSession, student_email: str) -> bytes:
    exam = db.query(Exam).filter(Exam.code == session.exam_code).first()
    report = build_exam_report(db, session, student_email)

    links = db.query(ExamQuestion).filter(ExamQuestion.exam_id == exam.id).all() if exam else []
    question_ids = [link.question_id for link in links]
    questions = db.query(Question).filter(Question.id.in_(question_ids)).all() if question_ids else []
    question_map = {q.id: q for q in questions}
    answers = db.query(ExamAnswer).filter(ExamAnswer.session_id == session.id).all()
    answer_map = {a.question_id: a for a in answers}

    violations = (
        db.query(Violation)
        .filter(Violation.session_id == session.id)
        .order_by(Violation.created_at.desc())
        .all()
    )
    event_counts = Counter(v.event_type for v in violations)

    total_questions = len(question_ids)
    attempted = len(answers)
    correct = sum(1 for answer in answers if answer.is_correct)
    wrong = max(0, attempted - correct)
    unanswered = max(0, total_questions - attempted)
    score_percent = float(report.get("score_percent", 0.0))
    accuracy = round((correct / attempted) * 100.0, 2) if attempted else 0.0

    started = session.started_at
    ended = session.ended_at or datetime.utcnow()
    duration_min = max(0.0, round((ended - started).total_seconds() / 60.0, 2))

    topic_breakdown = report.get("topic_breakdown", [])
    weakest_topic = "general"
    if topic_breakdown:
        weakest_topic = min(topic_breakdown, key=lambda item: float(item.get("mastery_percent", 0.0))).get("topic", "general")

    attempted_rate = (attempted / max(1, total_questions)) * 100.0
    unanswered_rate = (unanswered / max(1, total_questions)) * 100.0
    conceptual = max(0.0, min(100.0, score_percent))
    analytical = max(0.0, min(100.0, score_percent - (0.35 * unanswered_rate) - (0.18 * wrong)))
    application = max(0.0, min(100.0, score_percent - (0.12 * wrong) + (0.06 * attempted_rate)))

    focus_score = max(0.0, min(100.0, 100.0 - (session.risk_score * 0.9) - min(25.0, len(violations) * 1.4)))
    if session.risk_score >= 75:
        risk_level = "High"
    elif session.risk_score >= 40:
        risk_level = "Moderate"
    else:
        risk_level = "Low"

    top_abnormal = ", ".join([f"{name}({count})" for name, count in event_counts.most_common(3)]) or "No abnormal pattern recorded"

    strengths = report.get("strengths", [])
    weaknesses = report.get("improvement_areas", [])
    recommendations = report.get("recommended_actions", [])

    if weakest_topic and weakest_topic != "general":
        recommendations = recommendations + [
            f"Build a 3-day sprint around {weakest_topic}: concept recap, 30 timed questions, and error-log revision.",
            "For exam discipline, maintain webcam framing and avoid off-screen glance bursts during solving.",
        ]

    pdf = FPDF(orientation='L')
    pdf.set_auto_page_break(auto=True, margin=10)
    pdf.add_page()

    # Header
    pdf.set_fill_color(15, 23, 42)
    pdf.rect(0, 0, 210, 18, style="F")
    pdf.set_text_color(255, 255, 255)
    pdf.set_xy(10, 6)
    pdf.set_font("Helvetica", "B", 13)
    pdf.cell(140, 6, "Student Exam Analytics Report")
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_xy(156, 5)
    pdf.set_fill_color(30, 64, 175)
    pdf.rect(154, 3.8, 46, 10, style="F")
    pdf.cell(46, 7, f"Score {score_percent:.1f}%", align="C")

    pdf.set_text_color(15, 23, 42)
    pdf.set_y(22)

    _section_header(pdf, "Header Section")
    _kv_grid(
        pdf,
        [
            ("Exam Title", exam.title if exam else session.exam_code),
            ("Candidate", student_email),
            ("Session ID", str(session.id)),
            ("Exam Code", session.exam_code),
            ("Start", str(started)),
            ("End", str(session.ended_at or "In progress")),
            ("Duration", f"{duration_min} minutes"),
            ("Status", session.status),
        ],
    )

    _section_header(pdf, "Performance Overview")
    _kv_grid(
        pdf,
        [
            ("Score", f"{score_percent:.2f}%"),
            ("Accuracy", f"{accuracy:.2f}%"),
            ("Attempted", f"{attempted} / {total_questions}"),
            ("Correct", str(correct)),
            ("Wrong", str(wrong)),
            ("Unanswered", str(unanswered)),
        ],
    )
    pdf.set_font("Helvetica", "", 8.5)
    _write_line(
        pdf,
        f"AI Insight: {report.get('overall_summary', '')} "
        f"Accuracy-to-attempt balance indicates {'strong retention' if accuracy >= 75 else 'conceptual leakage in key topics'}.",
    )

    _section_header(pdf, "Visual Analytics")
    _bar_chart(
        pdf,
        "Topic Performance (Bar Chart)",
        [(item.get("topic", "general"), float(item.get("mastery_percent", 0.0))) for item in topic_breakdown],
    )
    _pie_chart(pdf, "Answer Distribution (Pie Chart)", correct, wrong, unanswered)
    _radar_chart(
        pdf,
        "Cognitive Skills (Radar Chart)",
        {
            "Conceptual": conceptual,
            "Analytical": analytical,
            "Application": application,
        },
    )

    _section_header(pdf, "Topic-wise Analysis")
    _ensure_space(pdf, 10 + max(1, len(topic_breakdown)) * 6)
    pdf.set_font("Helvetica", "B", 8.5)
    pdf.set_fill_color(241, 245, 249)
    pdf.rect(10, pdf.get_y(), 190, 6, style="F")
    pdf.set_xy(11, pdf.get_y() + 1)
    pdf.cell(46, 4, "Topic")
    pdf.cell(20, 4, "Score")
    pdf.cell(24, 4, "Strength")
    pdf.cell(98, 4, "Insight")
    pdf.ln(5)

    pdf.set_font("Helvetica", "", 8)
    for item in topic_breakdown[:8]:
        topic = str(item.get("topic", "general"))
        mastery = float(item.get("mastery_percent", 0.0))
        unanswered_topic = int(item.get("unanswered", 0))
        strength = _topic_strength(mastery)
        insight = _topic_insight(topic, mastery, unanswered_topic)
        y = pdf.get_y()
        _ensure_space(pdf, 6)
        pdf.set_xy(11, y)
        pdf.cell(46, 5.5, _safe_text(topic)[:20])
        pdf.cell(20, 5.5, f"{mastery:.1f}%")
        pdf.cell(24, 5.5, strength)
        pdf.multi_cell(98, 5.5, _safe_text(insight))

    _section_header(pdf, "Cognitive Skill Analysis")
    _kv_grid(
        pdf,
        [
            ("Conceptual Understanding", f"{conceptual:.1f}%"),
            ("Analytical Thinking", f"{analytical:.1f}%"),
            ("Application Ability", f"{application:.1f}%"),
        ],
        col_width=47,
    )

    _section_header(pdf, "Proctoring Analysis")
    _kv_grid(
        pdf,
        [
            ("Focus Score", f"{focus_score:.1f} / 100"),
            ("Risk Level", risk_level),
            ("Risk Score", f"{session.risk_score:.1f}"),
            ("Total Events", str(len(violations))),
            ("Abnormal Patterns", top_abnormal),
        ],
    )

    _section_header(pdf, "Strengths & Weaknesses")
    pdf.set_font("Helvetica", "B", 8.7)
    pdf.cell(0, 5, "Strengths", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 8.2)
    if strengths:
        for s in strengths[:3]:
            _write_line(pdf, f"- {s}")
    else:
        _write_line(pdf, "- Strongest area is still emerging; maintain consistent revision cadence.")

    pdf.set_font("Helvetica", "B", 8.7)
    pdf.cell(0, 5, "Weaknesses", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 8.2)
    if weaknesses:
        for w in weaknesses[:3]:
            _write_line(pdf, f"- {w}")
    else:
        _write_line(pdf, "- No critical weak zone, but improve answer speed under time pressure.")

    _section_header(pdf, "Personalized Recommendations")
    pdf.set_font("Helvetica", "", 8.2)
    for rec in recommendations[:5]:
        _write_line(pdf, f"- {rec}")

    _section_header(pdf, "Learning Enhancement")
    topic_label = weakest_topic.replace("_", " ").title()
    _draw_learning_diagram(
        pdf,
        f"Concept Flow for Weakest Topic: {topic_label}",
        [
            f"{topic_label} basics",
            "Core rule",
            "Worked example",
            "Common pitfall",
        ],
    )
    _draw_learning_diagram(
        pdf,
        "Revision Loop",
        ["Read concept", "Solve timed items", "Analyze mistakes", "Re-attempt"],
    )

    return _pdf_bytes(pdf)
