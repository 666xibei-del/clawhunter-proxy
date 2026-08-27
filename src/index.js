/**
 * Claw Hunter → OpenAI 相容圖片生成 API 代理 (免費模型版)
 * 部署到 Cloudflare Workers (免費)
 * 
 * 功能:
 * - 圖片生成 Web UI
 * - OpenAI 相容 API
 * - 僅免費層模型
 * - Token 池輪換
 */

// ============================================================
// 免費模型配置
// ============================================================

const CLAWHUNTER_BASE = 'https://clawhunter.fun';
const TOKEN_ENDPOINT = `${CLAWHUNTER_BASE}/api/v1/studio/token`;
const IMAGE_ENDPOINT = `${CLAWHUNTER_BASE}/api/studio/images`;

// 只保留免費/低價模型
const FREE_MODELS = {
  'z-image-turbo': { name: 'Z Image Turbo', provider: 'Alibaba', price: 0.005, desc: '最便宜·快速生成' },
  'seedream-5-lite': { name: 'Seedream 5 Lite', provider: 'ByteDance', price: 0.015, desc: '低價·支持編輯' },
  'grok-imagine': { name: 'Grok Imagine', provider: 'xAI', price: 0.015, desc: '多風格·可調解析度' },
  'flux-2-pro': { name: 'FLUX 2 Pro', provider: 'BFL', price: 0.02, desc: '性價比高·品質可調' },
  'seedream-4-5': { name: 'Seedream 4.5', provider: 'ByteDance', price: 0.02, desc: '穩定·支持編輯' },
  'recraft-v4': { name: 'Recraft V4', provider: 'Recraft', price: 0.02, desc: '設計風格·插畫' },
  'qwen-image-2': { name: 'Qwen Image 2', provider: 'Alibaba', price: 0.025, desc: '提示詞遵循度高' },
  'hunyuan-image-3': { name: 'Hunyuan Image 3', provider: 'Tencent', price: 0.025, desc: '真實場景·攝影風' },
};

// ============================================================
// Token 管理
// ============================================================

let tokenPool = [];

async function getStudioToken() {
  const now = Math.floor(Date.now() / 1000);
  tokenPool = tokenPool.filter(t => t.expiresAt - 120 > now);
  
  if (tokenPool.length > 0) {
    tokenPool.sort((a, b) => a.lastUsed - b.lastUsed);
    const token = tokenPool[0];
    token.lastUsed = now;
    return token.token;
  }
  
  const resp = await fetch(TOKEN_ENDPOINT);
  if (!resp.ok) throw new Error(`Token failed: ${resp.status}`);
  const data = await resp.json();
  tokenPool.push({ token: data.token, expiresAt: data.expiresAt, lastUsed: now });
  return data.token;
}

async function forceRefreshTokens(count = 3) {
  for (let i = 0; i < count; i++) {
    try {
      const resp = await fetch(TOKEN_ENDPOINT);
      if (resp.ok) {
        const data = await resp.json();
        tokenPool.push({ token: data.token, expiresAt: data.expiresAt, lastUsed: 0 });
      }
    } catch {}
    if (i < count - 1) await new Promise(r => setTimeout(r, 100));
  }
}

// ============================================================
// API Key 認證
// ============================================================

function validateApiKey(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return { valid: false, error: 'Missing Authorization' };
  
  let apiKey = null;
  if (authHeader.startsWith('Bearer ')) apiKey = authHeader.slice(7);
  else if (request.headers.get('X-Api-Key')) apiKey = request.headers.get('X-Api-Key');
  
  if (!apiKey) return { valid: false, error: 'Invalid format' };
  
  const validKeys = (env.API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);
  if (validKeys.length === 0) return { valid: true, key: apiKey };
  if (!validKeys.includes(apiKey)) return { valid: false, error: 'Invalid API key' };
  return { valid: true, key: apiKey };
}

// ============================================================
// Web UI HTML
// ============================================================

function getUIHTML() {
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>🐾 Claw Hunter - 免費圖片生成</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0a0a0f;--card:#12121a;--border:#1e1e2e;--accent:#6366f1;--accent2:#818cf8;--text:#e2e8f0;--muted:#64748b;--green:#22c55e;--red:#ef4444;--yellow:#eab308}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex;flex-direction:column}
.container{max-width:1000px;margin:0 auto;padding:20px;width:100%}
header{text-align:center;padding:30px 0;border-bottom:1px solid var(--border)}
header h1{font-size:28px;margin-bottom:8px}
header h1 span{color:var(--accent)}
header p{color:var(--muted);font-size:14px}
.badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600}
.badge-free{background:rgba(34,197,94,0.15);color:var(--green)}
.main{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:24px}
@media(max-width:768px){.main{grid-template-columns:1fr}}
.panel{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px}
.panel h2{font-size:16px;margin-bottom:16px;display:flex;align-items:center;gap:8px}
.form-group{margin-bottom:16px}
.form-group label{display:block;font-size:13px;color:var(--muted);margin-bottom:6px}
.form-group textarea,.form-group select,.form-group input{width:100%;padding:10px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;transition:border-color 0.2s}
.form-group textarea:focus,.form-group select:focus{border-color:var(--accent)}
.form-group textarea{min-height:100px;resize:vertical}
.model-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.model-card{padding:10px;border:1px solid var(--border);border-radius:8px;cursor:pointer;transition:all 0.2s;text-align:left;background:transparent}
.model-card:hover{border-color:var(--accent);background:rgba(99,102,241,0.05)}
.model-card.selected{border-color:var(--accent);background:rgba(99,102,241,0.1);box-shadow:0 0 0 1px var(--accent)}
.model-card .name{font-size:13px;font-weight:600}
.model-card .meta{font-size:11px;color:var(--muted);margin-top:2px}
.model-card .price{font-size:11px;color:var(--green);font-weight:600}
.options{display:flex;gap:8px;flex-wrap:wrap}
.option-btn{padding:6px 12px;border:1px solid var(--border);border-radius:6px;background:transparent;color:var(--text);font-size:12px;cursor:pointer;transition:all 0.2s}
.option-btn:hover{border-color:var(--accent)}
.option-btn.active{background:var(--accent);border-color:var(--accent);color:white}
.btn{padding:12px 24px;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;display:flex;align-items:center;justify-content:center;gap:8px}
.btn-primary{background:var(--accent);color:white;width:100%}
.btn-primary:hover{background:var(--accent2)}
.btn-primary:disabled{opacity:0.5;cursor:not-allowed}
.preview{min-height:300px;display:flex;align-items:center;justify-content:center;border:2px dashed var(--border);border-radius:12px;overflow:hidden;position:relative}
.preview img{max-width:100%;max-height:500px;object-fit:contain;border-radius:8px}
.preview .placeholder{text-align:center;color:var(--muted)}
.preview .placeholder .icon{font-size:48px;margin-bottom:8px}
.preview .loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px)}
.spinner{width:40px;height:40px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin 0.8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.status{margin-top:12px;padding:10px;border-radius:8px;font-size:13px;display:none}
.status.success{display:block;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);color:var(--green)}
.status.error{display:block;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:var(--red)}
.history{margin-top:16px}
.history-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.history-item{aspect-ratio:1;border-radius:8px;overflow:hidden;cursor:pointer;border:2px solid transparent;transition:all 0.2s}
.history-item:hover{border-color:var(--accent)}
.history-item img{width:100%;height:100%;object-fit:cover}
.api-info{margin-top:24px;padding:16px;background:var(--card);border:1px solid var(--border);border-radius:12px}
.api-info h3{font-size:14px;margin-bottom:12px}
.api-info code{background:var(--bg);padding:2px 6px;border-radius:4px;font-size:12px}
.api-info pre{background:var(--bg);padding:12px;border-radius:8px;overflow-x:auto;font-size:12px;margin-top:8px;line-height:1.6}
.copy-btn{background:var(--accent);color:white;border:none;padding:4px 8px;border-radius:4px;font-size:11px;cursor:pointer}
</style>
</head>
<body>
<header>
  <h1>🐾 <span>Claw Hunter</span> 免費圖片生成</h1>
  <p>OpenAI 相容 API · 免費模型 · CF Workers 全球部署</p>
</header>
<div class="container">
  <div class="main">
    <div class="panel">
      <h2>✍️ 輸入</h2>
      <div class="form-group">
        <label>提示詞</label>
        <textarea id="prompt" placeholder="描述你想要生成的圖片...&#10;例如: A cute orange cat sitting on a windowsill, watercolor style"></textarea>
      </div>
      <div class="form-group">
        <label>選擇模型 <span class="badge badge-free">免費</span></label>
        <div class="model-grid" id="modelGrid"></div>
      </div>
      <div class="form-group">
        <label>圖片比例</label>
        <div class="options" id="ratioOptions">
          <button class="option-btn active" data-ratio="1:1">1:1</button>
          <button class="option-btn" data-ratio="16:9">16:9</button>
          <button class="option-btn" data-ratio="9:16">9:16</button>
          <button class="option-btn" data-ratio="4:3">4:3</button>
          <button class="option-btn" data-ratio="3:4">3:4</button>
        </div>
      </div>
      <div class="form-group">
        <label>品質</label>
        <div class="options" id="qualityOptions">
          <button class="option-btn" data-quality="low">低 (最快)</button>
          <button class="option-btn active" data-quality="medium">中 (均衡)</button>
          <button class="option-btn" data-quality="high">高 (最慢)</button>
        </div>
      </div>
      <button class="btn btn-primary" id="generateBtn" onclick="generate()">
        <span id="btnText">🎨 生成圖片</span>
      </button>
      <div class="status" id="status"></div>
    </div>
    <div class="panel">
      <h2>🖼️ 預覽</h2>
      <div class="preview" id="preview">
        <div class="placeholder">
          <div class="icon">🎨</div>
          <p>輸入提示詞後點擊生成</p>
          <p style="font-size:12px;margin-top:4px">支持中文和英文提示詞</p>
        </div>
      </div>
      <div class="history" id="historySection" style="display:none">
        <h2 style="font-size:14px;margin-bottom:8px">📚 歷史記錄</h2>
        <div class="history-grid" id="historyGrid"></div>
      </div>
    </div>
  </div>
  <div class="api-info">
    <h3>📡 API 使用方法</h3>
    <pre><code><span style="color:#6b7280"># Python OpenAI SDK</span>
<span style="color:#c084fc">from</span> openai <span style="color:#c084fc">import</span> OpenAI

client = OpenAI(
    base_url=<span style="color:#86efac">"https://YOUR-WORKER.workers.dev/v1"</span>,
    api_key=<span style="color:#86efac">"your-api-key"</span>
)

response = client.images.generate(
    model=<span style="color:#86efac">"z-image-turbo"</span>,
    prompt=<span style="color:#86efac">"A cute cat"</span>,
    n=1
)
print(response.data[0].url)</code></pre>
  </div>
</div>
<script>
const MODELS = ${JSON.stringify(Object.entries(FREE_MODELS).map(([id, m]) => ({
  id, ...m
})), null, 2)};

let selectedModel = 'z-image-turbo';
let selectedRatio = '1:1';
let selectedQuality = 'medium';
let history = [];

// 初始化模型選擇
function initModels() {
  const grid = document.getElementById('modelGrid');
  grid.innerHTML = MODELS.map(m => \`
    <button class="model-card \${m.id === selectedModel ? 'selected' : ''}" 
            onclick="selectModel('\${m.id}')" data-model="\${m.id}">
      <div class="name">\${m.name}</div>
      <div class="meta">\${m.provider} · \${m.desc}</div>
      <div class="price">$\${m.price}/張</div>
    </button>
  \`).join('');
}

function selectModel(id) {
  selectedModel = id;
  document.querySelectorAll('.model-card').forEach(el => {
    el.classList.toggle('selected', el.dataset.model === id);
  });
}

// 選項按鈕
document.querySelectorAll('#ratioOptions .option-btn').forEach(btn => {
  btn.onclick = () => {
    selectedRatio = btn.dataset.ratio;
    document.querySelectorAll('#ratioOptions .option-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  };
});

document.querySelectorAll('#qualityOptions .option-btn').forEach(btn => {
  btn.onclick = () => {
    selectedQuality = btn.dataset.quality;
    document.querySelectorAll('#qualityOptions .option-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  };
});

// 生成圖片
async function generate() {
  const prompt = document.getElementById('prompt').value.trim();
  if (!prompt) {
    showStatus('請輸入提示詞', 'error');
    return;
  }

  const btn = document.getElementById('generateBtn');
  const btnText = document.getElementById('btnText');
  btn.disabled = true;
  btnText.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px"></div> 生成中...';

  // 顯示載入
  const preview = document.getElementById('preview');
  preview.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    const resp = await fetch('/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer free-user'
      },
      body: JSON.stringify({
        model: selectedModel,
        prompt: prompt,
        n: 1,
        quality: selectedQuality,
        size: selectedRatio === '1:1' ? '1024x1024' : 
              selectedRatio === '16:9' ? '1792x1024' :
              selectedRatio === '9:16' ? '1024x1792' :
              selectedRatio === '4:3' ? '1024x768' : '768x1024'
      })
    });

    const data = await resp.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    if (data.data && data.data.length > 0) {
      const imgUrl = data.data[0].url;
      
      // 顯示圖片
      preview.innerHTML = \`<img src="\${imgUrl}" alt="Generated" onclick="window.open('\${imgUrl}')">\`;
      
      // 添加到歷史
      history.unshift({ url: imgUrl, model: selectedModel, prompt: prompt.substring(0, 50) });
      updateHistory();
      
      // 顯示狀態
      const model = resp.headers.get('X-Claw-Model') || selectedModel;
      const cost = resp.headers.get('X-Claw-Cost') || '0';
      const note = resp.headers.get('X-Claw-Note') || '';
      showStatus(\`✅ 成功! 模型: \${model} · 費用: $\${parseFloat(cost).toFixed(4)} · \${note}\`, 'success');
    }
  } catch (e) {
    preview.innerHTML = \`<div class="placeholder"><div class="icon">❌</div><p>\${e.message}</p></div>\`;
    showStatus('❌ ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btnText.innerHTML = '🎨 生成圖片';
  }
}

function showStatus(msg, type) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = 'status ' + type;
}

function updateHistory() {
  const section = document.getElementById('historySection');
  const grid = document.getElementById('historyGrid');
  if (history.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';
  grid.innerHTML = history.slice(0, 8).map(h => \`
    <div class="history-item" onclick="window.open('\${h.url}')">
      <img src="\${h.url}" alt="\${h.prompt}" title="\${h.prompt}">
    </div>
  \`).join('');
}

// 鍵盤快捷鍵
document.getElementById('prompt').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    generate();
  }
});

// 初始化
initModels();
</script>
</body>
</html>`;
}

// ============================================================
// OpenAI 相容響應
// ============================================================

function openaiImageResponse(images, model) {
  return {
    created: Math.floor(Date.now() / 1000),
    data: images.map((img, i) => ({
      url: img.url || \`data:image/png;base64,\${img.b64_json}\`,
      revised_prompt: img.revised_prompt || null,
      index: i,
    })),
    model: model,
  };
}

function openaiErrorResponse(status, message) {
  return { error: { message, type: 'invalid_request_error', code: status } };
}

// ============================================================
// 主路由
// ============================================================

async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Api-Key',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // ============================================================
  // GET / - Web UI
  // ============================================================
  if (url.pathname === '/' || url.pathname === '') {
    return new Response(getUIHTML(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', ...corsHeaders }
    });
  }

  // ============================================================
  // GET /health
  // ============================================================
  if (url.pathname === '/health') {
    try {
      await getStudioToken();
      return Response.json({ status: 'ok', models: Object.keys(FREE_MODELS) }, { headers: corsHeaders });
    } catch (e) {
      return Response.json({ status: 'error', message: e.message }, { status: 503, headers: corsHeaders });
    }
  }

  // ============================================================
  // GET /v1/models
  // ============================================================
  if (url.pathname === '/v1/models') {
    const models = Object.entries(FREE_MODELS).map(([id, m]) => ({
      id, object: 'model', created: 1700000000, owned_by: 'clawhunter',
      pricing: { image: m.price },
      description: m.desc,
    }));
    return Response.json({ object: 'list', data: models }, { headers: corsHeaders });
  }

  // ============================================================
  // POST /v1/images/generations
  // ============================================================
  if (url.pathname === '/v1/images/generations' && request.method === 'POST') {
    const auth = validateApiKey(request, env);
    if (!auth.valid) {
      return Response.json(openaiErrorResponse(401, auth.error), { status: 401, headers: corsHeaders });
    }

    let body;
    try { body = await request.json(); } catch {
      return Response.json(openaiErrorResponse(400, 'Invalid JSON'), { status: 400, headers: corsHeaders });
    }

    const { model = 'z-image-turbo', prompt, n = 1, size = '1024x1024', quality = 'medium' } = body;
    if (!prompt) {
      return Response.json(openaiErrorResponse(400, 'prompt is required'), { status: 400, headers: corsHeaders });
    }

    // 驗證模型是否為免費模型
    if (!FREE_MODELS[model]) {
      return Response.json(
        openaiErrorResponse(400, \`Model '\${model}' not available. Free models: \${Object.keys(FREE_MODELS).join(', ')}\`),
        { status: 400, headers: corsHeaders }
      );
    }

    // 映射參數
    let aspect_ratio = '1:1';
    if (size) {
      const [w, h] = size.split('x').map(Number);
      if (w > h) aspect_ratio = '16:9';
      else if (w < h) aspect_ratio = '9:16';
      else aspect_ratio = '1:1';
    }

    const clawBody = { prompt, model, n: Math.min(n, 4), aspect_ratio, quality };

    // 帶重試的請求
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const token = await getStudioToken();
        const clawResp = await fetch(IMAGE_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-studio-token': token },
          body: JSON.stringify(clawBody),
        });

        if (clawResp.ok) {
          const clawData = await clawResp.json();
          if (!clawData.images || clawData.images.length === 0) {
            return Response.json(openaiErrorResponse(500, 'No images generated'), { status: 500, headers: corsHeaders });
          }
          const images = clawData.images.map(img => ({ url: img.url }));
          const response = openaiImageResponse(images, model);
          return Response.json(response, {
            headers: {
              ...corsHeaders,
              'X-Claw-Model': clawData.billing?.model || model,
              'X-Claw-Cost': String(clawData.billing?.usd || 0),
              'X-Claw-Note': clawData.billing?.note || '',
            }
          });
        } else if (clawResp.status === 429) {
          await forceRefreshTokens(3);
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
          continue;
        } else {
          const err = await clawResp.json().catch(() => ({}));
          return Response.json(openaiErrorResponse(clawResp.status, err.error || 'API error'), { status: clawResp.status, headers: corsHeaders });
        }
      }
      return Response.json(openaiErrorResponse(429, 'Rate limited - try again later'), { status: 429, headers: corsHeaders });
    } catch (e) {
      return Response.json(openaiErrorResponse(500, e.message), { status: 500, headers: corsHeaders });
    }
  }

  return Response.json(openaiErrorResponse(404, 'Not found'), { status: 404, headers: corsHeaders });
}

export default {
  async fetch(request, env, ctx) {
    try { return await handleRequest(request, env, ctx); }
    catch (e) { return Response.json(openaiErrorResponse(500, e.message), { status: 500 }); }
  },
};
