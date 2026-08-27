# 🐾 Claw Hunter → 免費圖片生成 API 代理

帶 Web UI 的免費圖片生成服務，部署到 Cloudflare Workers。

## ✨ 功能

- ✅ **Web UI** - 瀏覽器直接使用，無需編程
- ✅ **OpenAI 相容 API** - 可對接任何 OpenAI SDK
- ✅ **僅免費模型** - 3 個完全免費模型
- ✅ **Token 池輪換** - 自動繞過限流
- ✅ **全球部署** - CF Workers 200+ 邊緣節點
- ✅ **暗色主題 UI** - 現代化響應式設計

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

### 4. 獲取 URL

部署後會顯示 URL，格式如：
```
https://clawhunter-proxy.your-subdomain.workers.dev
```

## 📖 使用方法

### Web UI

直接訪問 Worker URL 即可使用：
```
https://clawhunter-proxy.your-subdomain.workers.dev
```

- 輸入提示詞 (Prompt)
- 選擇模型
- 選擇寬高比 (Aspect Ratio)
- 選擇品質 (Quality)
- 點擊 **Generate** 或按 `Ctrl+Enter`

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

| 模型 ID | 名稱 | 供應商 | 價格 | 免費解析度 |
|---|---|---|---|---|
| `gpt-image-2` | GPT Image 2 | OpenAI | **FREE** | 1K |
| `nano-banana-2` | Nano Banana 2 | Google | **FREE** | 1K |
| `kling-v3` | Kling V3 | Kuaishou | **FREE** | - |

> 所有模型完全免費，訪客每日有免費額度
> GPT Image 2 和 Nano Banana 2 在 1K 解析度下完全免費

## 📊 API 端點

| 方法 | 端點 | 說明 |
|---|---|---|
| `GET` | `/` | Web UI (HTML 頁面) |
| `GET` | `/app.js` | 客戶端 JavaScript |
| `GET` | `/health` | 健康檢查 |
| `GET` | `/v1/models` | 模型列表 (OpenAI 相容) |
| `POST` | `/v1/images/generations` | 圖片生成 (OpenAI 相容) |
| `POST` | `/admin/refresh-tokens` | 強制刷新 Token 池 |

## ⚙️ 配置

### 環境變量

| 變量 | 必需 | 說明 |
|---|---|---|
| `API_KEYS` | ❌ | 逗號分隔的 API Keys (留空=開放) |
| `RATE_LIMIT_PER_MINUTE` | ❌ | 每分鐘最大請求數 (默認: 10) |

### 自定義域名

在 `wrangler.toml` 中添加：

```toml
[[routes]]
pattern = "api.yourdomain.com/*"
zone_name = "yourdomain.com"
```

## 🔄 IP 輪換策略

### CF Workers 自然輪換

Cloudflare Workers 在全球 200+ 個數據中心運行，每次請求從不同邊緣節點發出：

```
用戶請求 → CF Edge (不同數據中心) → Claw Hunter
          ↓
   不同出口 IP = 不同免費額度
```

### Token 池輪換

Worker 維護一個 Token 池，每次請求使用最少使用的 Token：

```
Token Pool:
  Token-1 (used: 3次) → 優先使用
  Token-2 (used: 5次)
  Token-3 (used: 7次)
```

遇到 429 錯誤時自動刷新整個 Token 池並重試（最多 3 次）。

## 🧪 測試

```bash
# 基本測試
python3 test.py --url https://your-worker.workers.dev

# 使用 API Key
python3 test.py --url https://your-worker.workers.dev --key sk-claw-xxx

# 測試所有模型
python3 test.py --url https://your-worker.workers.dev --all-models
```

## ⚠️ 注意事項

1. **免費額度**: Claw Hunter 每 IP 每日有免費額度限制
2. **CF Workers**: 免費版 10 萬次/天，全球邊緣節點天然輪換 IP
3. **Token 池**: 自動維護多個 Token，12 小時過期前自動刷新
4. **圖片大小**: 返回的圖片可能較大 (100KB-1MB)
5. **無需 API Key**: 默認開放訪問，可選設置 API Keys 保護

## 📁 項目結構

```
clawhunter-proxy/
├── src/index.js      # Worker 主代碼 (374行)
│   ├── getHTML()     # Web UI HTML 頁面
│   ├── getClientJS() # 客戶端 JavaScript
│   ├── getToken()    # Token 獲取和池管理
│   └── handleRequest # 路由和 API 處理
├── wrangler.toml     # CF Workers 配置
├── package.json      # 依賴
├── deploy.sh         # 一鍵部署腳本
├── test.py           # API 測試腳本
└── README.md         # 本文檔
```

## 📄 License

MIT
