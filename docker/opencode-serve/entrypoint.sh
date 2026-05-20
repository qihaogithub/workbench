#!/bin/bash
set -e

mkdir -p ~/.opencode

# ── 多供应商模式：OPENCODE_PROVIDERS（JSON 格式）优先 ──
# 格式示例：
# OPENCODE_PROVIDERS='[
#   {"id":"deepseek","name":"DeepSeek","baseURL":"https://api.deepseek.com/v1","apiKey":"sk-xxx","models":["deepseek-chat","deepseek-reasoner"]},
#   {"id":"qwen","name":"通义千问","baseURL":"https://dashscope.aliyuncs.com/compatible-mode/v1","apiKey":"sk-yyy","models":["qwen-plus"]}
# ]'
# OPENCODE_DEFAULT_MODEL=deepseek/deepseek-chat

if [ -n "$OPENCODE_PROVIDERS" ]; then
  # 使用 node 解析 JSON 并生成 opencode.json
  node -e "
    const providers = JSON.parse(process.env.OPENCODE_PROVIDERS);
    const config = {
      '\$schema': 'https://opencode.ai/config.json',
      provider: {},
      model: process.env.OPENCODE_DEFAULT_MODEL || ''
    };
    for (const p of providers) {
      const models = {};
      for (const m of (p.models || [])) {
        models[m] = { name: m };
      }
      config.provider[p.id] = {
        npm: '@ai-sdk/openai-compatible',
        name: p.name || p.id,
        options: {
          baseURL: p.baseURL,
          apiKey: p.apiKey
        },
        models
      };
      if (!config.model && p.models && p.models.length > 0) {
        config.model = p.id + '/' + p.models[0];
      }
    }
    require('fs').writeFileSync(require('path').join(require('os').homedir(), '.opencode', 'opencode.json'), JSON.stringify(config, null, 2));
  "

  # 收集所有供应商前缀，写入白名单文件供前端读取
  ALLOWED_PREFIXES=$(node -e "
    const providers = JSON.parse(process.env.OPENCODE_PROVIDERS);
    console.log(providers.map(p => p.id + '/').join(','));
  ")
  echo "OPENCODE_ALLOWED_PREFIXES=${ALLOWED_PREFIXES}" > ~/.opencode/allowed-prefixes.env

# ── 简单模式：单供应商配置 ──
elif [ -n "$OPENCODE_API_KEY" ] && [ -n "$OPENCODE_API_BASE" ] && [ -n "$OPENCODE_MODELS" ]; then
  PROVIDER_NAME="${OPENCODE_PROVIDER_NAME:-custom}"

  # 支持逗号分隔多模型
  MODELS_JSON=$(echo "$OPENCODE_MODELS" | awk '{
    split($0, arr, ",")
    printf "{"
    for (i = 1; i <= length(arr); i++) {
      gsub(/^[ \t]+|[ \t]+$/, "", arr[i])
      if (i > 1) printf ","
      printf "\"%s\":{\"name\":\"%s\"}", arr[i], arr[i]
    }
    printf "}"
  }')

  # 第一个模型作为默认模型
  FIRST_MODEL=$(echo "$OPENCODE_MODELS" | cut -d',' -f1 | xargs)

  cat > ~/.opencode/opencode.json << EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "provider": {
    "${PROVIDER_NAME}": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "${PROVIDER_NAME}",
      "options": {
        "baseURL": "${OPENCODE_API_BASE}",
        "apiKey": "${OPENCODE_API_KEY}"
      },
      "models": ${MODELS_JSON}
    }
  },
  "model": "${PROVIDER_NAME}/${FIRST_MODEL}"
}
EOF

  # 写入白名单文件
  echo "OPENCODE_ALLOWED_PREFIXES=${PROVIDER_NAME}/" > ~/.opencode/allowed-prefixes.env
fi

exec opencode serve "$@"
