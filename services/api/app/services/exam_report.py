from collections import defaultdict
from typing import Any

from sqlalchemy.orm import Session

from app.models.entities import Exam, ExamAnswer, ExamQuestion, ExamSession, Question


def _stage_from_score(score_percent: float) -> str:
    if score_percent >= 85:
        return "Advanced"
    if score_percent >= 70:
        return "Proficient"
    if score_percent >= 50:
        return "Developing"
    return "Foundation"


def _integrity_band(risk_score: float) -> str:
    if risk_score >= 80:
        return "High Concern"
    if risk_score >= 40:
        return "Watchlist"
    return "Stable"


def build_exam_report(db: Session, session: ExamSession, student_email: str) -> dict[str, Any]:
    exam = db.query(Exam).filter(Exam.code == session.exam_code).first()
    if not exam:
        return {
            "stage": "Unavailable",
            "overall_summary": "Exam metadata is unavailable for this session.",
            "integrity_band": _integrity_band(session.risk_score),
            "strengths": [],
            "improvement_areas": [],
            "recommended_actions": ["Contact admin to repair exam metadata before analysis."],
            "topic_breakdown": [],
            "score_percent": 0.0,
        }

    links = db.query(ExamQuestion).filter(ExamQuestion.exam_id == exam.id).all()
    question_ids = [link.question_id for link in links]
    questions = db.query(Question).filter(Question.id.in_(question_ids)).all() if question_ids else []
    question_map = {question.id: question for question in questions}

    answers = db.query(ExamAnswer).filter(ExamAnswer.session_id == session.id).all()
    answer_map = {answer.question_id: answer for answer in answers}

    topic_stats: dict[str, dict[str, int]] = defaultdict(lambda: {"total": 0, "correct": 0, "incorrect": 0, "unanswered": 0})

    for qid in question_ids:
        question = question_map.get(qid)
        topic = (question.topic if question else "general").lower()
        topic_stats[topic]["total"] += 1

        answer = answer_map.get(qid)
        if not answer:
            topic_stats[topic]["unanswered"] += 1
            continue

        if answer.is_correct:
            topic_stats[topic]["correct"] += 1
        else:
            topic_stats[topic]["incorrect"] += 1

    total_questions = len(question_ids)
    correct_answers = sum(item["correct"] for item in topic_stats.values())
    score_percent = round((correct_answers / total_questions) * 100, 2) if total_questions else 0.0

    topic_breakdown = []
    for topic, stats in sorted(topic_stats.items(), key=lambda pair: pair[0]):
        mastery_percent = round((stats["correct"] / stats["total"]) * 100, 2) if stats["total"] else 0.0
        topic_breakdown.append(
            {
                "topic": topic,
                "correct": stats["correct"],
                "incorrect": stats["incorrect"],
                "unanswered": stats["unanswered"],
                "mastery_percent": mastery_percent,
            }
        )

    strong_topics = [item["topic"] for item in topic_breakdown if item["mastery_percent"] >= 75]
    weak_topics = [item["topic"] for item in topic_breakdown if item["mastery_percent"] < 60]

    strengths = strong_topics[:3]
    improvement_areas = weak_topics[:3]

    recommended_actions = []
    for area in improvement_areas:
        recommended_actions.append(f"Practice targeted drills in {area} with timed sets and review explanations.")

    if not recommended_actions:
        recommended_actions.append("Sustain performance with mixed-difficulty mock tests and spaced revision.")

    if session.risk_score >= 40:
        recommended_actions.append("Improve exam discipline: maintain focus, avoid tab switches, and reduce policy violations.")

    stage = _stage_from_score(score_percent)
    integrity = _integrity_band(session.risk_score)
    overall_summary = (
        f"{student_email} achieved {score_percent}% in {exam.title}. "
        f"Current stage is {stage} with integrity status {integrity}."
    )

    return {
        "stage": stage,
        "overall_summary": overall_summary,
        "integrity_band": integrity,
        "strengths": strengths,
        "improvement_areas": improvement_areas,
        "recommended_actions": recommended_actions,
        "topic_breakdown": topic_breakdown,
        "score_percent": score_percent,
    }
