from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_healthz_reports_mock_mode_honestly():
    response = client.get("/healthz")
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "dev-mock"
    assert body["provider"] == "dev-watermark"
    assert body["real_provider_configured"] is False


def test_providers_list_has_no_live_provider():
    body = client.get("/v1/providers").json()
    assert body["live_providers"] == []
    assert body["blocked_reason_fa"]


def test_try_on_requires_consent_reference():
    response = client.post(
        "/v1/try-on",
        json={"garment_ref": "dress-1", "user_photo_ref": "photo-1", "consent_reference": ""},
    )
    assert response.status_code == 422


def test_try_on_returns_watermarked_mock_result():
    response = client.post(
        "/v1/try-on",
        json={
            "garment_ref": "dress-<script>",
            "user_photo_ref": "photo-1",
            "consent_reference": "consent-2026-11",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["is_mock"] is True
    assert "تضمین" in body["disclaimer_fa"]
    assert "پیش‌نمایش آزمایشی" in body["label_fa"]
    assert body["asset_kind"] == "svg_placeholder"
    # محتوای SVG نباید تزریق HTML خام را عبور دهد
    assert "<script>" not in body["content"]
    assert "&lt;script&gt;" in body["content"]


def test_usage_reports_zero_real_cost():
    body = client.get("/v1/usage").json()
    assert body["tasks_billed"] == 0
    assert body["cost_rial"] == 0


def test_production_mode_refuses_to_serve(monkeypatch):
    import app.main as main_module

    monkeypatch.setattr(main_module, "APP_ENV", "production")
    response = client.post(
        "/v1/try-on",
        json={"garment_ref": "d", "user_photo_ref": "p", "consent_reference": "c"},
    )
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "PROVIDER_UNAVAILABLE"
