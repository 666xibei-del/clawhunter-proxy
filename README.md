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
- ✅ **Image Zoom** - Click to enlarge / 點擊放大
- ✅ **3 Free Models** - All completely free / 3 個完全免費模型
- ✅ **Global CDN** - CF Workers 200+ edge nodes / 全球邊緣節點

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

| Model | Provider | Text-to-Image | Image-to-Image | Price |
|---|---|---|---|---|
| `gpt-image-2` | OpenAI | ✅ | ✅ | **FREE** (1K) |
| `nano-banana-2` | Google | ✅ | ✅ | **FREE** (1K) |
| `kling-v3` | Kuaishou | ✅ | ❌ | **FREE** |

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
3. (Optional) Upload reference image for edit / （可選）上傳參考圖片
4. Click Generate / 點擊生成
5. **Click image to zoom** / **點擊圖片放大**

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
    "size": "1024x1024"
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

---

## 🔄 How It Works / 工作原理

```
User Request
    ↓
CF Worker (your-worker.workers.dev)
    ↓
Fetch Token → GET /api/v1/studio/token
    ↓
Generate Image → POST /api/studio/images
    ↓
Return Result
```

### IP Rotation / IP 輪換

- CF Workers run on 200+ global edge nodes / 全球 200+ 邊緣節點
- Each request may come from different IP / 每次請求從不同 IP 發出
- Token pool auto-refreshes on 429 / 遇到限流自動刷新 Token 池

---

## 🎨 UI Features / 界面功能

| Feature | Description |
|---|---|
| **Lightbox** | Click any image to zoom in / 點擊圖片放大 |
| **Drag & Drop** | Drag images to upload zone / 拖拽圖片上傳 |
| **Model Selector** | Switch between 3 free models / 切換 3 個免費模型 |
| **Aspect Ratio** | 1:1, 16:9, 9:16, 4:3, 3:4 / 選擇寬高比 |
| **Quality** | Low, Medium, High / 選擇品質 |
| **Status Bar** | Shows cost and model info / 顯示價格和模型信息 |
| **Keyboard Shortcuts** | Ctrl+Enter to generate / Ctrl+Enter 快速生成 |

---

## ⚠️ Notes / 注意事項

1. **Free Tier**: Claw Hunter has daily free limits per IP / 每 IP 每日免費額度有限
2. **CF Workers Free**: 100K requests/day / 免費版 10 萬次/天
3. **Token Pool**: Auto-maintained, 12h expiry / 自動維護，12 小時過期
4. **Image Size**: Results may be large (100KB-1MB) / 返回圖片可能較大
5. **Upload Limit**: Max 10MB per image, max 4 images / 每張最大 10MB，最多 4 張

---

## 📁 Project Structure / 項目結構

```
clawhunter-proxy/
├── src/index.js      # Worker code (450 lines)
├── wrangler.toml     # CF Workers config
├── package.json      # Dependencies
├── deploy.sh         # Deploy script
├── test.py           # API test script
└── README.md         # This file
```

## 📄 License / 授權

MIT
