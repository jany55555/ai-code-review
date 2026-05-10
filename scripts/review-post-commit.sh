#!/usr/bin/env bash
set -u

(
  ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
  SHA=$(git rev-parse HEAD 2>/dev/null) || exit 0

  REPO=$(basename "$ROOT")
  API_URL=${AI_CODE_REVIEW_API_URL:-http://localhost:8787}
  PROVIDER=${AI_CODE_REVIEW_PROVIDER:-claude}
  MODEL=${AI_CODE_REVIEW_MODEL:-claude-sonnet-4-6}

  DIFF=$(git show --format= --unified=0 "$SHA" 2>/dev/null) || exit 0

  if [ -z "$DIFF" ]; then
    exit 0
  fi

  export REPO SHA DIFF PROVIDER MODEL

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
print(json.dumps(payload, ensure_ascii=False))
PY
) &

disown 2>/dev/null || true

exit 0
