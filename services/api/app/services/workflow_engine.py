from datetime import datetime

from sqlalchemy.orm import Session

from app.models.entities import ExamSession, Violation, WorkflowRule


def evaluate_workflow_rules(
    db: Session,
    tenant_slug: str,
    session: ExamSession,
    latest_event_type: str,
) -> list[dict]:
    rules = (
        db.query(WorkflowRule)
        .filter(WorkflowRule.tenant_slug == tenant_slug, WorkflowRule.is_active.is_(True))
        .all()
    )

    actions = []
    for rule in rules:
        triggered = False

        if rule.metric == "risk_score" and session.risk_score > rule.threshold:
            triggered = True
        elif rule.metric.startswith("event_count:"):
            event_name = rule.metric.split(":", 1)[1]
            if event_name == latest_event_type:
                count = db.query(Violation).filter(Violation.session_id == session.id, Violation.event_type == event_name).count()
                if count > rule.threshold:
                    triggered = True

        if not triggered:
            continue

        action = rule.action.lower().strip()
        if action == "warn":
            db.add(
                Violation(
                    session_id=session.id,
                    event_type="workflow_warn",
                    severity="medium",
                    risk_delta=0.0,
                    detail=f"Workflow rule triggered warning: {rule.name}",
                )
            )
        elif action == "pause":
            session.status = "paused"
        elif action in {"terminate", "auto_submit"}:
            session.status = "terminated" if action == "terminate" else "auto_submitted"
            session.ended_at = datetime.utcnow()

        actions.append(
            {
                "rule_id": rule.id,
                "rule_name": rule.name,
                "action": action,
                "metric": rule.metric,
                "threshold": rule.threshold,
            }
        )

    return actions
