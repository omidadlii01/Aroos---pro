"""قرارداد مستقل از ارائه‌دهنده برای وظایف تصویری.

هر ارائه‌دهنده واقعی (مثلاً سرویس try-on تجاری) باید این پروتکل را پیاده کند تا
هسته تجاری بدون تغییر کد به آن سوییچ کند. ادعای کیفیت هر ارائه‌دهنده فقط پس از
benchmark مستند (فاز ۷ سند) قابل استفاده است.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Protocol

TaskKind = Literal["try_on", "segmentation", "garment_extraction", "image_generation"]


@dataclass(frozen=True)
class ProviderCapabilities:
    kind: TaskKind
    supports_cancellation: bool
    max_input_bytes: int
    notes_fa: str


@dataclass(frozen=True)
class TryOnRequest:
    garment_ref: str
    user_photo_ref: str
    consent_reference: str
    height_hint: str | None = None


@dataclass(frozen=True)
class TryOnResult:
    is_mock: bool
    disclaimer_fa: str
    asset_kind: Literal["svg_placeholder", "raster"]
    content: str
    metadata: dict[str, str] = field(default_factory=dict)


class TryOnProvider(Protocol):
    name: str
    is_mock: bool

    def capabilities(self) -> list[ProviderCapabilities]: ...

    def run(self, request: TryOnRequest) -> TryOnResult: ...
