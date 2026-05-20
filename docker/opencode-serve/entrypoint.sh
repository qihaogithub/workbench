#!/bin/bash
set -e

if [ -n "$OPENCODE_API_KEY" ] && [ -n "$OPENCODE_API_BASE" ] && [ -n "$OPENCODE_MODELS" ]; then
  mkdir -p ~/.opencode

  cat > ~/.opencode/opencode.json << EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "provider": {
    "custom": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Custom LLM",
      "options": {
        "baseURL": "${OPENCODE_API_BASE}",
        "apiKey": "${OPENCODE_API_KEY}"
      },
      "models": {
        "${OPENCODE_MODELS}": {
          "name": "${OPENCODE_MODELS}"
        }
      }
    }
  },
  "model": "custom/${OPENCODE_MODELS}"
}
EOF
fi

exec opencode serve "$@"