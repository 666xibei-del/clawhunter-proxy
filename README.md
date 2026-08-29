# 🐾 Claw Hunter Free Image Gen / 免費圖片生成

OpenAI Compatible API Proxy with Web UI, deployed on Cloudflare Workers.  
帶 Web UI 的 OpenAI 相容圖片生成 API 代理，部署到 Cloudflare Workers。

---

## ✨ Features / 功能

- ✅ **Web UI** - Generate images directly in browser / 瀏覽器直接使用
- ✅ **OpenAI Compatible API** - Works with any OpenAI SDK / 相容 OpenAI SDK
- ✅ **Text-to-Image** - Describe what you want / 文生圖
- ✅ **Image-to-Image** - Upload reference image for edit / 圖生圖（上傳參考圖片）
- ✅ **Drag & Drop** - Drag images to upload / 拖拽上傳
- ✅ **Image Zoom (Lightbox)** - Click to enlarge any image / 點擊放大圖片
- ✅ **Aspect Ratio Selection** - 1:1, 16:9, 9:16, 4:3, 3:4 / 選擇寬高比
- ✅ **3 Free Models** - All completely free / 3 個完全免費模型
- ✅ **Token Pool** - Auto-refresh with retry on rate limit / 自動刷新 Token + 限流重試
- ✅ **IP Rotation** - Multi-platform relay for unlimited quota / 多平台代理輪詢繞過限流
- ✅ **Free Platform Relays** - Vercel + Deno + Netlify (all free) / 免費平台代理中轉
- ✅ **Global CDN** - CF Workers 200+ edge nodes / 全球邊緣節點
- ✅ **Dark Theme** - Modern dark UI / 現代暗色主題

---

## 🚀 Quick Deploy / 快速部署

```bash
# 1. Install Wrangler CLI
npm install -g wrangler

# 2. Login to Cloudflare
npx wrangler login

# 3. Deploy Worker
cd clawhunter-proxy
npm install
npx wrangler deploy
```

Your Worker URL will be:  
`https://clawhunter-proxy.YOUR-SUBDOMAIN.workers.dev`

---

## 📋 Supported Models / 支持的模型

| Model | Provider | Text-to-Image | Image-to-Image | Free Tier |
|---|---|---|---|---|
| `gpt-image-2` | OpenAI | ✅ | ✅ | **FREE** (1K daily) |
| `nano-banana-2` | Google | ✅ | ✅ | **FREE** (1K daily) |
| `kling-v3` | Kuaishou | ✅ | ❌ | **FREE** (daily limit) |

> 所有模型均支持訪客免費層，每日有免費額度限制。

---

## 📖 Usage / 使用方法

### Web UI / 網頁界面

Visit your Worker URL directly:  
直接訪問 Worker URL:

```
https://clawhunter-proxy.YOUR-SUBDOMAIN.workers.dev
```

1. Enter prompt / 輸入提示詞
2. Select model / 選擇模型
3. Choose aspect ratio / 選擇寬高比 (1:1, 16:9, 9:16, 4:3, 3:4)
4. Choose quality / 選擇品質 (Low, Medium, High)
5. (Optional) Upload reference image for edit / （可選）上傳參考圖片
6. Click Generate / 點擊生成
7. **Click image to zoom** / **點擊圖片放大**

### Image Upload / 圖片上傳

- **Click** / 點擊: Click upload zone to select / 點擊上傳區域選擇文件
- **Drag & Drop** / 拖拽: Drag images onto the zone / 拖拽圖片到上傳區域
- **Formats** / 格式: PNG, JPEG, WebP
- **Size** / 大小: Max 10MB
- **Limit** / 限制: Max 4 reference images / 最多 4 張參考圖片

### Python (OpenAI SDK)

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://clawhunter-proxy.YOUR-SUBDOMAIN.workers.dev/v1",
    api_key="your-key"
)

# Text-to-Image / 文生圖
response = client.images.generate(
    model="gpt-image-2",
    prompt="A cute orange cat sitting on a windowsill",
    n=1,
    size="1024x1024"
)
print(response.data[0].url)

# Image-to-Image / 圖生圖
import base64
with open("input.png", "rb") as f:
    img_b64 = "data:image/png;base64," + base64.b64encode(f.read()).decode()

response = client.images.generate(
    model="gpt-image-2",
    prompt="Add sunglasses to the cat",
    n=1,
    extra_body={"image": img_b64}
)
print(response.data[0].url)

# With aspect ratio / 指定比例
response = client.images.generate(
    model="gpt-image-2",
    prompt="A wide landscape",
    n=1,
    extra_body={"aspect_ratio": "16:9"}
)
print(response.data[0].url)
```

### Node.js

```javascript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://clawhunter-proxy.YOUR-SUBDOMAIN.workers.dev/v1',
  apiKey: 'your-key'
});

// Text-to-Image / 文生圖
const response = await client.images.generate({
  model: 'gpt-image-2',
  prompt: 'A cute orange cat',
  n: 1,
  size: '1024x1024'
});
console.log(response.data[0].url);

// With aspect ratio / 指定比例
const wide = await client.images.generate({
  model: 'gpt-image-2',
  prompt: 'A wide landscape',
  n: 1,
  extra_body: { aspect_ratio: '16:9' }
});
console.log(wide.data[0].url);
```

### curl

```bash
# Text-to-Image / 文生圖
curl -X POST https://clawhunter-proxy.YOUR-SUBDOMAIN.workers.dev/v1/images/generations \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-2",
    "prompt": "A cute orange cat",
    "n": 1,
    "aspect_ratio": "1:1"
  }'

# Image-to-Image / 圖生圖
curl -X POST https://clawhunter-proxy.YOUR-SUBDOMAIN.workers.dev/v1/images/generations \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-2",
    "prompt": "Add sunglasses",
    "n": 1,
    "image": "data:image/png;base64,...BASE64_DATA..."
  }'

# 16:9 Widescreen / 寬屏
curl -X POST https://clawhunter-proxy.YOUR-SUBDOMAIN.workers.dev/v1/images/generations \
  -H "Content-Type: application/json" \
  -d '{
    "model": "nano-banana-2",
    "prompt": "A sunset over the ocean",
    "n": 1,
    "aspect_ratio": "16:9"
  }'
```

---

## 📊 API Endpoints / API 端點

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Web UI / 網頁界面 |
| `GET` | `/app.js` | Client JavaScript |
| `GET` | `/health` | Health check / 健康檢查 |
| `GET` | `/v1/models` | List models / 模型列表 |
| `POST` | `/v1/images/generations` | Generate image / 圖片生成 |
| `POST` | `/admin/refresh-tokens` | Refresh token pool |

### Request Parameters / 請求參數

| Parameter | Type | Default | Description |
|---|---|---|---|
| `model` | string | `gpt-image-2` | Model ID |
| `prompt` | string | **required** | Image description |
| `n` | int | 1 | Number of images (1-4) |
| `quality` | string | `medium` | `low`, `medium`, `high` |
| `aspect_ratio` | string | `1:1` | `1:1`, `16:9`, `9:16`, `4:3`, `3:4` |
| `image` | string | — | Base64 data URL for image editing |
| `input_images` | string[] | — | Multiple reference images (max 8) |
| `reference_images` | string[] | — | Studio API format (max 4) |

---

## 🔄 How It Works / 工作原理

```
User Request → Web UI or API
    ↓
CF Worker (your-worker.workers.dev)
    ↓
Fetch Token → GET /api/v1/studio/token
    ↓
Generate Image → POST /api/studio/images
    ↓
Auto-retry on 429 (exponential backoff)
    ↓
Return Result (base64 or URL)
```

### Token Pool Management / Token 池管理

- Pool of 5 tokens, auto-refreshed / 5 個 Token 自動輪換
- Proactive refill when pool < 3 / 池不足時自動補充
- Parallel token fetching (Promise.all) / 並行刷新

### Retry Strategy / 重試策略

- Max 6 attempts per request / 每次請求最多 6 次重試
- Exponential backoff: 2s → 4s → 8s → 16s → 20s / 指數退避
- Daily limit detection: stops early if quota exhausted / 偵測每日配額用完
- Respects `retry_after_seconds` from upstream / 尊重上游重試時間

### IP Rotation / IP 輪換

- CF Workers run on 200+ global edge nodes / 全球 200+ 邊緣節點
- Each request may come from different IP / 每次請求從不同 IP 發出
- Token pool auto-refreshes on 429 / 遇到限流自動刷新 Token 池

---

## 🎨 UI Features / 界面功能

| Feature | Description |
|---|---|
| **Lightbox** | Click any image to zoom in full-screen / 點擊圖片全屏放大 |
| **Drag & Drop** | Drag images to upload zone / 拖拽圖片上傳 |
| **Model Selector** | Switch between 3 free models / 切換 3 個免費模型 |
| **Aspect Ratio** | 1:1, 16:9, 9:16, 4:3, 3:4 / 選擇寬高比 |
| **Quality** | Low, Medium, High / 選擇品質 |
| **Status Bar** | Shows cost and model info / 顯示價格和模型信息 |
| **Keyboard Shortcuts** | Ctrl+Enter to generate / Ctrl+Enter 快速生成 |
| **Error Messages** | Shows specific upstream errors / 顯示具體上游錯誤信息 |

---

## 🔄 IP Rotation / IP 輪詢

When CF Worker's IP hits daily limit, automatically rotate through free platform relays:  
當 CF Worker IP 用完每日配額時，自動輪詢免費平台代理：

```
User → Main Worker (CF Edge A)
         ↓ Direct (if OK)
         clawhunter.fun
         ↓ Daily limit? →
         Relay 1 (Vercel Edge)    → clawhunter.fun ✅
         Relay 2 (Deno Deploy)    → clawhunter.fun ✅
         Relay 3 (Netlify Edge)   → clawhunter.fun ✅
         Relay 4 (CF Account 2)   → clawhunter.fun ✅
```

### Free Platform Quota / 免費平台額度

| Platform | Free Tier | Edge Locations | Credit Card |
|---|---|---|---|
| **Cloudflare Workers** | 100K req/day | 200+ | No |
| **Vercel Edge** | 100GB bandwidth/month | 30+ | No |
| **Deno Deploy** | 100GB bandwidth/month | 35+ | No |
| **Netlify Edge** | 125K requests/month | 10+ | No |

### Quick Setup / 快速設置

```bash
# Deploy relays to all free platforms
./deploy-relays.sh all

# Get RELAY_URLS configuration
./deploy-relays.sh config

# Set on main Worker
echo "https://app.vercel.app/relay,https://app.deno.dev/relay" | npx wrangler secret put RELAY_URLS
npx wrangler deploy

# Check relay health
./deploy-relays.sh status
```

---

## ⚠️ Notes / 注意事項

1. **Free Tier**: Claw Hunter has daily free limits per IP / 每 IP 每日免費額度有限
2. **CF Workers Free**: 100K requests/day / 免費版 10 萬次/天
3. **Token Pool**: Auto-maintained, 12h expiry / 自動維護，12 小時過期
4. **Image Size**: Results may be large (100KB-3MB) / 返回圖片可能較大
5. **Upload Limit**: Max 10MB per image, max 4 images / 每張最大 10MB，最多 4 張
6. **Rate Limit**: Auto-retry with relay rotation / 自動重試 + 代理輪詢
7. **IP Rotation**: Deploy relays on free platforms for more quota / 部署免費平台代理增加額度

---

## 📁 Project Structure / 項目結構

```
clawhunter-proxy/
├── src/index.js          # Main Worker (676 lines)
├── relay.js              # CF Worker relay template
├── relays/
│   ├── vercel/           # Vercel Edge relay
│   ├── deno/             # Deno Deploy relay
│   └── netlify/          # Netlify Edge relay
├── deploy-relays.sh      # One-click deploy to all platforms
├── deploy-multi.sh       # Multi CF account deploy
├── wrangler.toml         # CF Workers config
├── wrangler-relay.toml   # Relay Worker config
├── batch_generate.py     # Batch generation script
└── README.md
```

## 📄 License / 授權

MIT
