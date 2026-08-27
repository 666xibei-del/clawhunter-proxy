#!/bin/bash
# Claw Hunter API 代理部署腳本

set -e

echo "🐾 Claw Hunter API 代理部署"
echo "============================"

# 檢查 wrangler
if ! command -v npx &> /dev/null; then
    echo "❌ 請先安裝 Node.js: https://nodejs.org"
    exit 1
fi

# 安裝依賴
echo "📦 安裝依賴..."
npm install

# 登入 Cloudflare (如果需要)
echo "🔐 檢查 Cloudflare 認證..."
npx wrangler whoami 2>/dev/null || {
    echo "請先登入 Cloudflare:"
    npx wrangler login
}

# 設置 API Keys
echo ""
echo "🔑 設置 API Keys..."
echo "請輸入你的 API Keys (逗號分隔，留空使用默認):"
read -r API_KEYS

if [ -n "$API_KEYS" ]; then
    echo "設置 API Keys..."
    echo "$API_KEYS" | npx wrangler secret put API_KEYS
fi

# 設置 Rate Limit
echo ""
echo "⏱️  設置 Rate Limit (每分鐘最大請求數):"
read -r RATE_LIMIT
RATE_LIMIT=${RATE_LIMIT:-10}

# 部署
echo ""
echo "🚀 部署到 Cloudflare Workers..."
npx wrangler deploy

# 獲取 URL
echo ""
echo "✅ 部署完成!"
echo ""
echo "📋 使用方法:"
echo "============================"
WORKER_URL=$(npx wrangler deployments list 2>/dev/null | grep -oP 'https://[^\s]+' | head -1)
if [ -z "$WORKER_URL" ]; then
    WORKER_URL="https://clawhunter-proxy.YOUR_SUBDOMAIN.workers.dev"
fi

echo ""
echo "🌐 API 端點: $WORKER_URL"
echo ""
echo "🔧 OpenAI SDK 使用:"
echo "   import OpenAI from 'openai';"
echo "   const client = new OpenAI({"
echo "     baseURL: '$WORKER_URL/v1',"
echo "     apiKey: 'your-api-key'"
echo "   });"
echo ""
echo "   const image = await client.images.generate({"
echo "     model: 'z-image-turbo',"
echo "     prompt: 'A cute cat',"
echo "     n: 1,"
echo "     size: '1024x1024'"
echo "   });"
echo ""
echo "📡 curl 測試:"
echo "   curl -X POST $WORKER_URL/v1/images/generations \\"
echo "     -H 'Authorization: Bearer your-api-key' \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"model\":\"z-image-turbo\",\"prompt\":\"A cute cat\",\"n\":1}'"
echo ""
echo "📊 模型列表: GET $WORKER_URL/v1/models"
echo "❤️  健康檢查: GET $WORKER_URL/health"
