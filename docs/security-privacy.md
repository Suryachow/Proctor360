# Security and Privacy Baseline

## Security controls implemented
- JWT-based authentication with device binding hash
- Admin MFA (password + TOTP/static second factor)
- Browser integrity checks (tab-switch, fullscreen exit, copy/paste attempts)
- Risk-scored violation policy with automatic submission threshold
- Admin intervention actions: warn, pause, terminate
- Full HTTP audit trail persisted for compliance review

## Privacy controls to keep
- Explicit consent screen prior to exam start
- Clearly visible data usage statement
- Event-first logging, not continuous storage by default
- Configurable retention and deletion policy for recordings and snapshots
- GDPR "download my data" endpoint for subject access requests

## Recommendations before production go-live
1. Move CORS from wildcard to explicit allowlist.
2. Encrypt object storage and DB at rest.
3. Use rotating secrets from a vault (AWS Secrets Manager, GCP Secret Manager).
4. Add per-tenant retention policy and legal jurisdiction controls.
5. Run DPIA and legal review for biometric data processing.
