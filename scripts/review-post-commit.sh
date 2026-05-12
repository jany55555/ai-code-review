#!/usr/bin/env bash
set -u

(
  ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
  SHA=$(git rev-parse HEAD 2>/dev/null) || exit 0

  REPO=$(basename "$ROOT")
  API_URL=${AI_CODE_REVIEW_API_URL:-http://localhost:8787}
  PROVIDER=${AI_CODE_REVIEW_PROVIDER:-claude}
  MODEL=${AI_CODE_REVIEW_MODEL:-claude-sonnet-4-6}
  API_KEY=${AI_CODE_REVIEW_API_KEY:-}
  BASE_URL=${AI_CODE_REVIEW_BASE_URL:-}
  # 插件启动时写入 .git/ai-code-review-client-id，脚本读取后传给后端，实现按用户隔离推送
  CLIENT_ID_FILE="$ROOT/.git/ai-code-review-client-id"
  CLIENT_ID=$(cat "$CLIENT_ID_FILE" 2>/dev/null || echo "")

  DIFF=$(git show --format= --unified=0 "$SHA" 2>/dev/null) || exit 0

  if [ -z "$DIFF" ]; then
    exit 0
  fi

  export REPO SHA DIFF PROVIDER MODEL API_KEY BASE_URL CLIENT_ID

  python3 - <<'PY' | curl --silent --show-error --fail --max-time 8 \
    -X POST "$API_URL/review/run" \
    -H "Content-Type: application/json" \
    --data-binary @- >/dev/null 2>&1 || true
import json
import os

payload = {
    "repo": os.environ["REPO"],
    "pr": 0,
    "sha": os.environ["SHA"],
    "diff": os.environ["DIFF"],
    "trigger": "post-commit",
    "provider": os.environ["PROVIDER"],
    "model": os.environ["MODEL"],
}
if os.environ.get("CLIENT_ID"):
    payload["clientId"] = os.environ["CLIENT_ID"]
if os.environ.get("API_KEY"):
    payload["apiKey"] = os.environ["API_KEY"]
if os.environ.get("BASE_URL"):
    payload["baseUrl"] = os.environ["BASE_URL"]
print(json.dumps(payload, ensure_ascii=False))
PY
) &

disown 2>/dev/null || true

exit 0
