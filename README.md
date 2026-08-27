# 🐾 Claw Hunter → OpenAI 圖片生成 API 代理

將 Claw Hunter 的圖片生成 API 包裝為 OpenAI 相容格式，部署到 Cloudflare Workers (免費)。

## ✨ 功能

- ✅ **OpenAI 相容** - 直接替換 OpenAI SDK 的 baseURL
- ✅ **API Key 認證** - 安全的 API Key 管理
- ✅ **免費模型** - z-image-turbo ($0.005/張)
- ✅ **Rate Limiting** - 可選的請求限制
- ✅ **CORS 支持** - 跨域請求
- ✅ **全球部署** - Cloudflare Workers 全球邊緣節點

## 🚀 快速部署

### 1. 安裝 Wrangler CLI

```bash
npm install -g wrangler
```

### 2. 登入 Cloudflare

```bash
npx wrangler login
```

### 3. 部署 Worker

```bash
cd clawhunter-proxy
npm install
npx wrangler deploy
```

### 4. 設置 API Keys

```bash
# 互動式設置
echo "your-api-key-1,your-api-key-2" | npx wrangler secret put API_KEYS
```

### 5. 獲取 URL

部署後會顯示 URL，格式如：
```
https://clawhunter-proxy.your-subdomain.workers.dev
```

## 📖 使用方法

### OpenAI SDK (Python)

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://clawhunter-proxy.your-subdomain.workers.dev/v1",
    api_key="your-api-key"
)

response = client.images.generate(
    model="z-image-turbo",
    prompt="A cute orange cat sitting on a windowsill",
    n=1,
    size="1024x1024"
)

print(response.data[0].url)
```

### OpenAI SDK (Node.js)

```javascript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://clawhunter-proxy.your-subdomain.workers.dev/v1',
  apiKey: 'your-api-key'
});

const response = await client.images.generate({
  model: 'z-image-turbo',
  prompt: 'A cute orange cat sitting on a windowsill',
  n: 1,
  size: '1024x1024'
});

console.log(response.data[0].url);
```

### curl

```bash
curl -X POST https://clawhunter-proxy.your-subdomain.workers.dev/v1/images/generations \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "z-image-turbo",
    "prompt": "A cute orange cat sitting on a windowsill",
    "n": 1,
    "size": "1024x1024"
  }'
```

## 📋 支持的模型

| 模型 ID | 名稱 | 價格/張 | 特點 |
|---|---|---|---|
| `z-image-turbo` | Z Image Turbo | $0.005 | 最便宜 |
| `nano-banana-2` | Nano Banana 2 | $0.035 | Google 專業品質 |
| `gpt-image-2` | GPT Image 2 | $0.011~ | OpenAI 頂級 |
| `flux-2-pro` | FLUX 2 Pro | $0.02 | 性價比高 |
| `seedream-4-5` | Seedream 4.5 | $0.02 | 編輯支持 |
| `grok-imagine` | Grok Imagine | $0.015 | xAI 多風格 |
| `qwen-image-2` | Qwen Image 2 | $0.025 | 提示詞遵循 |
| `hunyuan-image-3` | Hunyuan Image 3 | $0.025 | 真實場景 |
| `recraft-v4` | Recraft V4 | $0.02 | 設計風格 |
| `gpt-image-1-5` | GPT Image 1.5 | $0.04 | 文字渲染 |
| `flux-2-max` | FLUX 2 Max | $0.04 | FLUX 最高 |
| `nano-banana-pro` | Nano Banana Pro | $0.07 | Google 旗艦 |
| `seedream-5-lite` | Seedream 5 Lite | $0.015 | 低價編輯 |

## ⚙️ 配置選項

### 環境變量

| 變量 | 必需 | 說明 |
|---|---|---|
| `API_KEYS` | ❌ | 逗號分隔的 API Keys (留空=開放) |
| `RATE_LIMIT_PER_MINUTE` | ❌ | 每分鐘最大請求數 (默認: 10) |
| `RATE_LIMIT_KV` | ❌ | KV Namespace 用於 Rate Limiting |

### KV Namespace (可選)

如果需要 Rate Limiting，創建 KV Namespace：

```bash
npx wrangler kv:namespace create RATE_LIMIT_KV
```

然後在 `wrangler.toml` 中添加：

```toml
[[kv_namespaces]]
binding = "RATE_LIMIT_KV"
id = "你的-kv-namespace-id"
```

## 🔧 高級配置

### 自定義域名

在 `wrangler.toml` 中添加：

```toml
[[routes]]
pattern = "api.yourdomain.com/*"
zone_name = "yourdomain.com"
```

### 環境隔離

創建 `wrangler.toml` 的 dev 和 prod 配置：

```toml
[env.dev]
name = "clawhunter-proxy-dev"

[env.prod]
name = "clawhunter-proxy"
```

## 📊 API 端點

| 方法 | 端點 | 說明 |
|---|---|---|
| `GET` | `/` | API 信息 |
| `GET` | `/health` | 健康檢查 |
| `GET` | `/v1/models` | 模型列表 |
| `POST` | `/v1/images/generations` | 圖片生成 |

## 🧪 測試

```bash
# 測試單個模型
python3 test.py --url https://your-worker.workers.dev --key sk-claw-xxx

# 測試所有模型
python3 test.py --url https://your-worker.workers.dev --key sk-claw-xxx --all-models
```

## 🔄 IP 輪換策略

### CF Workers 自然輪換

Cloudflare Workers 在全球 200+ 個數據中心運行，每次請求可能從不同邊緣節點發出，**天然具備 IP 輪換能力**：

```
用戶請求 → CF Edge (不同數據中心) → Claw Hunter
          ↓
   不同出口 IP = 不同免費額度
```

### Token 池輪換

Worker 維護一個 Token 池，每次請求使用不同的 Token：

```
Token Pool:
  Token-1 (IP-A) → 用於請求 1
  Token-2 (IP-B) → 用於請求 2
  Token-3 (IP-C) → 用於請求 3
```

### 管理員端點

```bash
# 強制刷新 Token 池
POST /admin/refresh-tokens
Authorization: Bearer your-admin-key
```

## ⚠️ 注意事項

1. **免費額度**: Claw Hunter 每日有免費額度限制 (per IP)
2. **CF Workers**: 免費版 10 萬次/天，每次從不同 IP 發出
3. **Token 池**: 自動維護多個 Token，遇到 429 自動輪換
4. **API Key 安全**: 請妥善保管你的 API Keys
5. **圖片大小**: 返回的圖片可能較大 (100KB-1MB)

## 📄 License

MIT
