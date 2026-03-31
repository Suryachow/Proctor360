import httpx

from app.core.config import settings


async def analyze_frame(
    image_base64: str,
    include_advanced: bool = False,
    reference_face_image_base64: str | None = None,
) -> dict:
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            f"{settings.ai_engine_url}/analyze",
            json={
                "image_base64": image_base64,
                "include_advanced": include_advanced,
                "reference_face_image_base64": reference_face_image_base64,
            },
        )
        response.raise_for_status()
        return response.json()
