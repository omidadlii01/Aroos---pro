#!/usr/bin/env bash
# اجرای تست‌های سرویس AI در محیط مجازی محلی.
set -euo pipefail
cd "$(dirname "$0")/../services/ai"
if [ ! -d .venv ]; then
  echo "محیط مجازی سرویس AI وجود ندارد؛ ابتدا:"
  echo "  python3 -m venv services/ai/.venv && services/ai/.venv/bin/pip install -r services/ai/requirements-dev.txt"
  exit 1
fi
.venv/bin/python -m pytest
