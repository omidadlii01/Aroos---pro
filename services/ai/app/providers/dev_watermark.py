"""آداپتور آزمایشی: تصویر واقعی تولید نمی‌کند و همیشه watermark می‌زند."""

from __future__ import annotations

from .base import ProviderCapabilities, TryOnRequest, TryOnResult

WATERMARK_FA = "پیش‌نمایش آزمایشی — خروجی هوش مصنوعی واقعی نیست"
DISCLAIMER_FA = (
    "این تصویر یک پیش‌نمایش تصویری/آزمایشی است، نه سفارش تأییدشده مزون. "
    "تضمین اندازه، فیت واقعی، جنس پارچه یا نتیجه خیاطی نیست."
)


class DevWatermarkProvider:
    name = "dev-watermark"
    is_mock = True

    def capabilities(self) -> list[ProviderCapabilities]:
        return [
            ProviderCapabilities(
                kind="try_on",
                supports_cancellation=False,
                max_input_bytes=0,
                notes_fa="آداپتور توسعه: هیچ پردازش تصویری واقعی انجام نمی‌شود.",
            )
        ]

    def run(self, request: TryOnRequest) -> TryOnResult:
        safe_garment = _escape(request.garment_ref)[:60]
        svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="720" height="960" viewBox="0 0 720 960" role="img" aria-label="{WATERMARK_FA}">
  <defs>
    <pattern id="hatch" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="24" stroke="#e5e7eb" stroke-width="10"/>
    </pattern>
  </defs>
  <rect width="720" height="960" fill="#faf8f5"/>
  <rect width="720" height="960" fill="url(#hatch)" opacity="0.5"/>
  <rect x="24" y="24" width="672" height="912" fill="none" stroke="#b93a6c" stroke-width="4" stroke-dasharray="12 10" rx="18"/>
  <text x="360" y="300" text-anchor="middle" font-family="Vazirmatn, sans-serif" font-size="34" fill="#7d2546">{WATERMARK_FA}</text>
  <text x="360" y="360" text-anchor="middle" font-family="Vazirmatn, sans-serif" font-size="22" fill="#64748b">مرجع لباس: {safe_garment}</text>
  <text x="360" y="430" text-anchor="middle" font-family="Vazirmatn, sans-serif" font-size="20" fill="#64748b">این جای‌نگهدار است؛ تصویر عروس تولید نشده است.</text>
</svg>"""
        return TryOnResult(
            is_mock=True,
            disclaimer_fa=DISCLAIMER_FA,
            asset_kind="svg_placeholder",
            content=svg,
            metadata={
                "watermark_fa": WATERMARK_FA,
                "consent_reference_present": "1" if request.consent_reference else "0",
            },
        )


def _escape(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )
