from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Proctor360 API"
    database_url: str = "sqlite:///./proctor.db"
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret: str = "replace_me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 120
    exam_otp_expire_minutes: int = 30
    admin_email: str = "admin@proctor360.com"
    admin_password: str = "Admin123!"
    admin_mfa_secret: str = "JBSWY3DPEHPK3PXP"
    admin_mfa_window: int = 1
    admin_mfa_static_code: str = "123456"
    compliance_mode: str = "GDPR,ISO27001,FERPA"
    ai_engine_url: str = "http://localhost:8100"
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"


settings = Settings()
