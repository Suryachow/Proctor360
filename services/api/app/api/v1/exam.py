from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_student
from app.core.security import verify_password
from app.db.session import get_db
from app.models.entities import Exam, ExamAnswer, ExamOtpUse, ExamQuestion, ExamSession, Question, Student, TenantExamBinding, Violation
from app.schemas.exam import (
    AnswerSaveRequest,
    AnswerSaveResponse,
    AssignedExamOut,
    AttemptedExamOut,
    AvailableExamOut,
    ExamReportOut,
    EventRequest,
    ExamQuestionOut,
    FrameAnalyzeRequest,
    SessionAnswersOut,
    SessionResponse,
    StartExamRequest,
    StudentDashboardOut,
    SubmitExamResponse,
)
from app.services.ai_client import analyze_frame
from app.services.exam_report import build_exam_report
from app.services.exam_report_pdf import build_exam_report_pdf
from app.services.webhook_dispatcher import dispatch_webhook_event
from app.services.workflow_engine import evaluate_workflow_rules
from app.services.violation_engine import get_reason, get_risk_delta, get_severity, normalize_risk, should_auto_submit
from app.services.ws_manager import ws_manager

router = APIRouter(prefix="/exam", tags=["exam"])


def _normalize_image_data_url(raw_image: str) -> str:
    image = (raw_image or "").strip()
    if not image:
        return ""
    if image.startswith("data:image"):
        return image
    return f"data:image/jpeg;base64,{image}"


def _is_exam_public(exam: Exam) -> bool:
    return len(exam.enrollments) == 0


def _is_student_allowed_for_exam(exam: Exam, student_email: str) -> bool:
    if _is_exam_public(exam):
        return True
    return any(enrollment.student_email == student_email for enrollment in exam.enrollments)


def _compute_session_result(db: Session, session: ExamSession) -> tuple[int, int, float]:
    exam = db.query(Exam).filter(Exam.code == session.exam_code).first()
    if not exam:
        return 0, 0, 0.0

    total_questions = len(exam.question_links)
    correct_answers = (
        db.query(ExamAnswer)
        .filter(ExamAnswer.session_id == session.id, ExamAnswer.is_correct.is_(True))
        .count()
    )
    score_percent = round((correct_answers / total_questions) * 100, 2) if total_questions else 0.0
    return correct_answers, total_questions, score_percent


def _tenant_for_exam(db: Session, exam_code: str) -> str:
    binding = db.query(TenantExamBinding).filter(TenantExamBinding.exam_code == exam_code).first()
    return binding.tenant_slug if binding else "default"


@router.get("/available", response_model=list[AvailableExamOut])
def list_available_exams(
    current_student: Student = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    rows = db.query(Exam).filter(Exam.is_active.is_(True)).order_by(Exam.created_at.desc()).all()
    return [
        AvailableExamOut(
            exam_code=exam.code,
            title=exam.title,
            question_count=len(exam.question_links),
            is_public=_is_exam_public(exam),
        )
        for exam in rows
        if _is_student_allowed_for_exam(exam, current_student.email)
    ]


@router.get("/{exam_code}/questions", response_model=list[ExamQuestionOut])
def get_exam_questions(
    exam_code: str,
    current_student: Student = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    normalized_code = exam_code.strip().upper()
    exam = db.query(Exam).filter(Exam.code == normalized_code, Exam.is_active.is_(True)).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    if not _is_student_allowed_for_exam(exam, current_student.email):
        raise HTTPException(status_code=403, detail="You are not assigned to this exam")

    links = (
        db.query(ExamQuestion, Question)
        .join(Question, Question.id == ExamQuestion.question_id)
        .filter(ExamQuestion.exam_id == exam.id)
        .all()
    )

    return [
        ExamQuestionOut(
            id=question.id,
            prompt=question.prompt,
            options=[question.option_a, question.option_b, question.option_c, question.option_d],
        )
        for _, question in links
    ]


@router.post("/answer", response_model=AnswerSaveResponse)
def save_answer(
    payload: AnswerSaveRequest,
    current_student: Student = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    session = (
        db.query(ExamSession)
        .filter(ExamSession.id == payload.session_id, ExamSession.student_id == current_student.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != "active":
        raise HTTPException(status_code=400, detail="Cannot save answers on non-active session")

    exam = db.query(Exam).filter(Exam.code == session.exam_code).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    valid_question = (
        db.query(ExamQuestion)
        .filter(ExamQuestion.exam_id == exam.id, ExamQuestion.question_id == payload.question_id)
        .first()
    )
    if not valid_question:
        raise HTTPException(status_code=400, detail="Question is not part of this exam")

    question = db.query(Question).filter(Question.id == payload.question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    selected_option = payload.selected_option.upper()
    answer = (
        db.query(ExamAnswer)
        .filter(ExamAnswer.session_id == session.id, ExamAnswer.question_id == payload.question_id)
        .first()
    )

    if not answer:
        answer = ExamAnswer(
            session_id=session.id,
            question_id=payload.question_id,
            selected_option=selected_option,
            is_correct=selected_option == question.correct_option,
        )
        db.add(answer)
    else:
        answer.selected_option = selected_option
        answer.is_correct = selected_option == question.correct_option

    db.commit()
    answered_count = db.query(ExamAnswer).filter(ExamAnswer.session_id == session.id).count()
    return AnswerSaveResponse(ok=True, answered_count=answered_count)


@router.get("/answers/{session_id}", response_model=SessionAnswersOut)
def get_saved_answers(
    session_id: int,
    current_student: Student = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    session = (
        db.query(ExamSession)
        .filter(ExamSession.id == session_id, ExamSession.student_id == current_student.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    answers = db.query(ExamAnswer).filter(ExamAnswer.session_id == session.id).all()
    return SessionAnswersOut(
        session_id=session.id,
        answers={answer.question_id: answer.selected_option for answer in answers},
    )


@router.get("/dashboard", response_model=StudentDashboardOut)
def student_dashboard(
    current_student: Student = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    available_exams_rows = db.query(Exam).filter(Exam.is_active.is_(True)).order_by(Exam.created_at.desc()).all()

    attempted_sessions = (
        db.query(ExamSession)
        .filter(ExamSession.student_id == current_student.id)
        .order_by(ExamSession.started_at.desc())
        .all()
    )

    attempted_by_code = {session.exam_code for session in attempted_sessions}

    assigned_exams = [
        AssignedExamOut(
            exam_code=exam.code,
            title=exam.title,
            question_count=len(exam.question_links),
            has_attempt=exam.code in attempted_by_code,
            is_public=_is_exam_public(exam),
        )
        for exam in available_exams_rows
        if _is_student_allowed_for_exam(exam, current_student.email)
    ]

    attempted_exams = []
    for session in attempted_sessions:
        exam = db.query(Exam).filter(Exam.code == session.exam_code).first()
        correct, total, percent = _compute_session_result(db, session)
        attempted_exams.append(
            AttemptedExamOut(
                session_id=session.id,
                exam_code=session.exam_code,
                title=exam.title if exam else session.exam_code,
                status=session.status,
                started_at=session.started_at.isoformat(),
                ended_at=session.ended_at.isoformat() if session.ended_at else None,
                correct_answers=correct,
                total_questions=total,
                score_percent=percent,
            )
        )

    return StudentDashboardOut(assigned_exams=assigned_exams, attempted_exams=attempted_exams)


@router.post("/start", response_model=SessionResponse)
async def start_exam(
    payload: StartExamRequest,
    current_student: Student = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    exam_code = payload.exam_code.strip().upper()
    exam = db.query(Exam).filter(Exam.code == exam_code, Exam.is_active.is_(True)).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    if not _is_student_allowed_for_exam(exam, current_student.email):
        raise HTTPException(status_code=403, detail="You are not assigned to this exam")

    active_session = (
        db.query(ExamSession)
        .filter(
            ExamSession.student_id == current_student.id,
            ExamSession.exam_code == exam_code,
            ExamSession.status.in_(["active", "paused"]),
        )
        .first()
    )

    otp_usage = (
        db.query(ExamOtpUse)
        .filter(ExamOtpUse.exam_id == exam.id, ExamOtpUse.student_email == current_student.email)
        .first()
    )

    if otp_usage:
        if active_session:
            return SessionResponse(
                session_id=active_session.id,
                status=active_session.status,
                risk_score=active_session.risk_score,
            )
        raise HTTPException(status_code=403, detail="Verification code already used for this student")

    if not verify_password(payload.verification_code, exam.otp_hash):
        raise HTTPException(status_code=403, detail="Invalid verification code")

    if not current_student.registered_face_image:
        raise HTTPException(status_code=403, detail="Student profile is missing registered live image. Re-register required.")

    try:
        verification = await analyze_frame(
            payload.live_image_base64,
            include_advanced=False,
            reference_face_image_base64=current_student.registered_face_image,
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Identity verification service unavailable") from exc

    metrics = verification.get("metrics") or {}
    face_count = int(metrics.get("face_count", 0) or 0)
    events = verification.get("events") or []
    has_unknown_person = any(event.get("event_type") == "unknown_person_detected" for event in events)

    if face_count != 1:
        raise HTTPException(status_code=403, detail="Live face verification failed. Ensure exactly one face is visible.")

    if has_unknown_person:
        raise HTTPException(status_code=403, detail="Live face does not match registered account image.")

    session = ExamSession(
        student_id=current_student.id, 
        exam_code=exam_code,
        device_fingerprint=payload.device_fingerprint or "unknown",
        registered_face_image=current_student.registered_face_image
    )
    db.add(ExamOtpUse(exam_id=exam.id, student_email=current_student.email))
    db.add(session)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Exam start already in progress for this student") from exc
    db.refresh(session)

    tenant_slug = _tenant_for_exam(db, exam_code)
    await dispatch_webhook_event(
        db,
        tenant_slug,
        "exam.started",
        {
            "session_id": session.id,
            "student_email": current_student.email,
            "exam_code": exam_code,
            "status": session.status,
        },
    )
    return SessionResponse(session_id=session.id, status=session.status, risk_score=session.risk_score)


@router.post("/event")
async def ingest_event(
    payload: EventRequest,
    current_student: Student = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    session = db.query(ExamSession).filter(ExamSession.id == payload.session_id, ExamSession.student_id == current_student.id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    tenant_slug = _tenant_for_exam(db, session.exam_code)

    risk_delta = get_risk_delta(payload.event_type)
    severity = get_severity(risk_delta)

    violation = Violation(
        session_id=session.id,
        event_type=payload.event_type,
        severity=severity,
        risk_delta=risk_delta,
        detail=payload.detail or get_reason(payload.event_type),
    )
    session.risk_score = normalize_risk(session.risk_score + risk_delta)

    db.add(violation)
    db.flush()

    triggered = evaluate_workflow_rules(db, tenant_slug, session, payload.event_type)

    if payload.event_type == "tab_switch":
        session.status = "auto_submitted"
        session.ended_at = datetime.utcnow()
    elif should_auto_submit(session.risk_score):
        session.status = "auto_submitted"
        session.ended_at = datetime.utcnow()

    db.commit()

    await ws_manager.broadcast(
        "admin",
        {
            "type": "violation",
            "session_id": session.id,
            "event_type": payload.event_type,
            "risk_delta": risk_delta,
            "total_risk": session.risk_score,
            "status": session.status,
            "detail": violation.detail,
            "reason": get_reason(payload.event_type),
            "workflow_actions": triggered,
        },
    )

    if session.status in {"auto_submitted", "terminated"}:
        await dispatch_webhook_event(
            db,
            tenant_slug,
            "exam.completed",
            {
                "session_id": session.id,
                "exam_code": session.exam_code,
                "status": session.status,
                "risk_score": session.risk_score,
            },
        )

    return {"ok": True, "session_status": session.status, "total_risk": session.risk_score}


@router.post("/frame")
async def frame_analysis(
    payload: FrameAnalyzeRequest,
    current_student: Student = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    session = db.query(ExamSession).filter(ExamSession.id == payload.session_id, ExamSession.student_id == current_student.id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    tenant_slug = _tenant_for_exam(db, session.exam_code)

    # Validate device fingerprint consistency
    if payload.device_fingerprint and session.device_fingerprint and session.device_fingerprint != "unknown":
        if payload.device_fingerprint != session.device_fingerprint:
            session.status = "malpractice"
            session.ended_at = datetime.utcnow()
            violation = Violation(
                session_id=session.id,
                event_type="device_fingerprint_mismatch",
                severity="high",
                risk_delta=50.0,
                detail="Device fingerprint changed during exam. Possible exam taking from different device.",
            )
            db.add(violation)
            db.commit()
            await dispatch_webhook_event(
                db,
                tenant_slug,
                "exam.completed",
                {
                    "session_id": session.id,
                    "exam_code": session.exam_code,
                    "status": session.status,
                    "risk_score": session.risk_score,
                },
            )
            return {"ok": False, "error": "Device fingerprint mismatch detected", "status": session.status}

    # Perform continuous face verification if reference image available
    if session.registered_face_image:
        result = await analyze_frame(
            payload.image_base64,
            payload.include_advanced,
            session.registered_face_image,
        )
    else:
        result = await analyze_frame(payload.image_base64, payload.include_advanced)
    
    detected_events = result.get("events", [])
    metrics = result.get("metrics", {})

    # Check for face similarity drops during exam
    identity_similarity = metrics.get("identity_similarity")
    if identity_similarity is not None and session.registered_face_image:
        if identity_similarity < 0.55:
            # Face similarity dropped below threshold during exam
            violation = Violation(
                session_id=session.id,
                event_type="face_similarity_drop",
                severity="high",
                risk_delta=40.0,
                detail=f"Face similarity dropped to {identity_similarity:.3f} during exam. Possible impersonation attempt.",
            )
            evidence_image = _normalize_image_data_url(payload.image_base64)
            if evidence_image:
                violation.detail = f"{violation.detail}\n[[EVIDENCE_IMAGE]]{evidence_image}"
            db.add(violation)
            session.risk_score = normalize_risk(session.risk_score + 40.0)

    critical_violations_detected = False
    identity_mismatch_detected = False

    for event in detected_events:
        event_type = event.get("event_type", "suspicious_behavior")
        
        # Mark critical violations
        if event_type in {"multiple_faces", "unknown_person_detected", "phone_detected"}:
            critical_violations_detected = True
        
        if event_type == "unknown_person_detected":
            identity_mismatch_detected = True
            
        risk_delta = get_risk_delta(event_type)
        severity = get_severity(risk_delta)
        explainability = event.get("explainability", get_reason(event_type))

        detail = f"{event.get('detail', 'AI detection')} | Reason: {explainability}"
        
        # Capture evidence image for ALL violations, not just specific types
        evidence_image = _normalize_image_data_url(payload.image_base64)
        if evidence_image:
            detail = f"{detail}\n[[EVIDENCE_IMAGE]]{evidence_image}"

        session.risk_score = normalize_risk(session.risk_score + risk_delta)
        violation = Violation(
            session_id=session.id,
            event_type=event_type,
            severity=severity,
            risk_delta=risk_delta,
            detail=detail,
        )
        db.add(violation)

        await ws_manager.broadcast(
            "admin",
            {
                "type": "ai_violation",
                "session_id": session.id,
                "event_type": event_type,
                "risk_delta": risk_delta,
                "total_risk": session.risk_score,
                "status": session.status,
                "severity": severity,
                "reason": explainability,
            },
        )

        evaluate_workflow_rules(db, tenant_slug, session, event_type)

    # Immediate termination for critical violations
    if identity_mismatch_detected or critical_violations_detected:
        session.status = "terminated"
        session.ended_at = datetime.utcnow()
    elif should_auto_submit(session.risk_score):
        session.status = "auto_submitted"
        session.ended_at = datetime.utcnow()

    db.commit()
    if session.status in {"auto_submitted", "terminated", "malpractice"}:
        await dispatch_webhook_event(
            db,
            tenant_slug,
            "exam.completed",
            {
                "session_id": session.id,
                "exam_code": session.exam_code,
                "status": session.status,
                "risk_score": session.risk_score,
            },
        )
    return {
        "ok": True, 
        "detections": result, 
        "total_risk": session.risk_score, 
        "status": session.status,
        "critical_violation_detected": critical_violations_detected,
    }


@router.post("/submit/{session_id}", response_model=SubmitExamResponse)
async def submit_exam(
    session_id: int,
    current_student: Student = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    session = db.query(ExamSession).filter(ExamSession.id == session_id, ExamSession.student_id == current_student.id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status == "auto_submitted":
        session.status = "auto_submitted"
    else:
        session.status = "submitted"
    session.ended_at = datetime.utcnow()
    db.commit()
    tenant_slug = _tenant_for_exam(db, session.exam_code)
    await dispatch_webhook_event(
        db,
        tenant_slug,
        "exam.completed",
        {
            "session_id": session.id,
            "exam_code": session.exam_code,
            "status": session.status,
            "risk_score": session.risk_score,
        },
    )
    correct, total, percent = _compute_session_result(db, session)
    report = build_exam_report(db, session, current_student.email)
    return SubmitExamResponse(
        ok=True,
        status=session.status,
        correct_answers=correct,
        total_questions=total,
        score_percent=percent,
        report=ExamReportOut(**report),
    )


@router.get("/report/{session_id}", response_model=ExamReportOut)
def get_exam_report(
    session_id: int,
    current_student: Student = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    session = db.query(ExamSession).filter(ExamSession.id == session_id, ExamSession.student_id == current_student.id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return ExamReportOut(**build_exam_report(db, session, current_student.email))


@router.get("/report/{session_id}/pdf")
def get_exam_report_pdf(
    session_id: int,
    current_student: Student = Depends(get_current_student),
    db: Session = Depends(get_db),
):
    session = db.query(ExamSession).filter(ExamSession.id == session_id, ExamSession.student_id == current_student.id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    pdf_bytes = build_exam_report_pdf(db, session, current_student.email)
    filename = f"exam-report-{session.exam_code.lower()}-session-{session.id}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
