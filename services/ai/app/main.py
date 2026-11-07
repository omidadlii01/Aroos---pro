"""سرویس AI BridalOS — نسخه آداپتور آزمایشی.

وضعیت: **مسدود به‌علت دسترسی**. هیچ کلید ارائه‌دهنده AI موجود نیست و هیچ مدل
واقعی فراخوانی نمی‌شود. این سرویس فقط:
  1) قرارداد مستقل از ارائه‌دهنده را تثبیت می‌کند،
  2) خروجی آزمایشی watermark‌دار تولید می‌کند تا مسیر job/UI تست شود،
  3) در محیط production از سرویس‌دهی امتناع می‌کند تا mock با خروجی واقعی
     اشتباه گرفته نشود.
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from .providers.base import TryOnRequest
from .providers.dev_watermark import DISCLAIMER_FA, DevWatermarkProvider

APP_ENV = os.getenv("APP_ENV", "local")
AI_PROVIDER = os.getenv("AI_PROVIDER", "dev-watermark")
AI_PROVIDER_API_KEY = os.getenv("AI_PROVIDER_API_KEY", "").strip()
SERVICE_VERSION = "0.1.0"

app = FastAPI(title="BridalOS AI Service", version=SERVICE_VERSION)
provider = DevWatermarkProvider()


class TryOnPayload(BaseModel):
    garment_ref: str = Field(min_length=1, max_length=200)
    user_photo_ref: str = Field(min_length=1, max_length=200)
    consent_reference: str = Field(
        min_length=1,
        max_length=200,
        description="ارجاع به رضایت ثبت‌شده کاربر؛ بدون آن پردازش تصویر مجاز نیست.",
    )
    height_hint: str | None = Field(default=None, max_length=40)


class TryOnResponse(BaseModel):
    task_id: str
    status: Literal["completed"]
    provider: str
    is_mock: bool
    label_fa: str
    disclaimer_fa: str
    asset_kind: Literal["svg_placeholder", "raster"]
    content: str
    created_at: str


def _ensure_non_production(operation: str) -> None:
    if APP_ENV == "production":
        raise HTTPException(
            status_code=503,
            detail={
                "code": "PROVIDER_UNAVAILABLE",
                "message": "سرویس AI در production فعال نیست: آداپتور واقعی و کلید ارائه‌دهنده پیکربندی نشده است.",
                "operation": operation,
            },
        )


@app.get("/healthz")
def healthz() -> dict[str, object]:
    return {
        "status": "ok",
        "version": SERVICE_VERSION,
        "environment": APP_ENV,
        "provider": provider.name,
        "mode": "dev-mock" if provider.is_mock else "live",
        "real_provider_configured": bool(AI_PROVIDER_API_KEY),
        "note_fa": "پردازش تصویری واقعی انجام نمی‌شود؛ خروجی آزمایشی watermark‌دار است.",
    }


@app.get("/v1/providers")
def list_providers() -> dict[str, object]:
    return {
        "providers": [
            {
                "name": provider.name,
                "is_mock": provider.is_mock,
                "status": "available-dev-only",
                "capabilities": [
                    {
                        "kind": capability.kind,
                        "supports_cancellation": capability.supports_cancellation,
                        "notes_fa": capability.notes_fa,
                    }
                    for capability in provider.capabilities()
                ],
            }
        ],
        "live_providers": [],
        "blocked_reason_fa": "هیچ ارائه‌دهنده واقعی AI (با کلید و مجوز تجاری) پیکربندی نشده است؛ benchmark فاز ۷ انجام نشده است.",
    }


@app.post("/v1/try-on", response_model=TryOnResponse)
def create_try_on(
    payload: TryOnPayload,
    x_request_id: str | None = Header(default=None),
) -> TryOnResponse:
    _ensure_non_production("try_on")

    result = provider.run(
        TryOnRequest(
            garment_ref=payload.garment_ref,
            user_photo_ref=payload.user_photo_ref,
            consent_reference=payload.consent_reference,
            height_hint=payload.height_hint,
        )
    )

    return TryOnResponse(
        task_id=str(uuid.uuid4()),
        status="completed",
        provider=provider.name,
        is_mock=True,
        label_fa="پیش‌نمایش آزمایشی (هوش مصنوعی واقعی نیست)",
        disclaimer_fa=DISCLAIMER_FA,
        asset_kind=result.asset_kind,
        content=result.content,
        created_at=datetime.now(timezone.utc).isoformat(),
    )


@app.get("/v1/usage")
def usage() -> dict[str, object]:
    """مصرف اعتبار: در حالت mock هیچ هزینه واقعی وجود ندارد و ادعای هزینه نمی‌شود."""
    return {
        "provider": provider.name,
        "is_mock": True,
        "tasks_billed": 0,
        "cost_rial": 0,
        "note_fa": "در حالت آداپتور آزمایشی هیچ هزینه واقعی API ثبت نمی‌شود.",
    }
