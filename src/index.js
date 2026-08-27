/**
 * Claw Hunter → OpenAI 相容圖片生成 API 代理
 * 部署到 Cloudflare Workers (免費)
 * 
 * 功能:
 * - OpenAI 相容的 /v1/images/generations 端點
 * - API Key 認證
 * - Claw Hunter Token 自動刷新
 * - 免費/付費模型切換
 * - Rate Limiting
 */

// ============================================================
// 配置 (部署時通過 wrangler.toml 的 [vars] 設置)
// ============================================================

const CLAWHUNTER_BASE = 'https://clawhunter.fun';
const TOKEN_ENDPOINT = `${CLAWHUNTER_BASE}/api/v1/studio/token`;
const IMAGE_ENDPOINT = `${CLAWHUNTER_BASE}/api/studio/images`;
const MODELS_ENDPOINT = `${CLAWHUNTER_BASE}/api/v1/media/models`;

// 免費模型映射
const FREE_MODELS = {
  'z-image-turbo': 'z-image-turbo',
  'nano-banana-2': 'nano-banana-2',
  'gpt-image-2': 'gpt-image-2',
  'flux-2-pro': 'flux-2-pro',
  'seedream-4-5': 'seedream-4-5',
  'grok-imagine': 'grok-imagine',
  'qwen-image-2': 'qwen-image-2',
  'hunyuan-image-3': 'hunyuan-image-3',
  'recraft-v4': 'recraft-v4',
  'gpt-image-1-5': 'gpt-image-1-5',
  'flux-2-max': 'flux-2-max',
  'nano-banana-pro': 'nano-banana-pro',
  'seedream-5-lite': 'seedream-5-lite',
};

// 價格映射 (每張圖 USD)
const MODEL_PRICES = {
  'z-image-turbo': 0.005,
  'seedream-5-lite': 0.015,
  'grok-imagine': 0.015,
  'flux-2-pro': 0.02,
  'seedream-4-5': 0.02,
  'recraft-v4': 0.02,
  'qwen-image-2': 0.025,
  'hunyuan-image-3': 0.025,
  'nano-banana-2': 0.035,
  'flux-2-max': 0.04,
  'gpt-image-1-5': 0.04,
  'nano-banana-pro': 0.07,
  'gpt-image-2': 0.114,
};

// ============================================================
// Token 管理 (多 Token 輪換)
// ============================================================

// Token 池 - 每個 Worker 實例維護多個 token
let tokenPool = [];  // [{token, expiresAt, lastUsed}]
const MAX_TOKENS = 5;
const TOKEN_REFRESH_BUFFER = 120; // 提前 2 分鐘刷新

/**
 * 獲取一個可用的 Studio Token
 * 策略: 
 * 1. 返回池中最早未使用的有效 token
 * 2. 如果都過期，批量刷新
 * 3. CF Workers 每次冷啟動會從不同 IP 發起請求
 */
async function getStudioToken() {
  const now = Math.floor(Date.now() / 1000);
  
  // 清理過期 token
  tokenPool = tokenPool.filter(t => t.expiresAt - TOKEN_REFRESH_BUFFER > now);
  
  // 返回最久未使用的 token (輪換)
  if (tokenPool.length > 0) {
    tokenPool.sort((a, b) => a.lastUsed - b.lastUsed);
    const token = tokenPool[0];
    token.lastUsed = now;
    return token.token;
  }
  
  // 池為空，獲取新 token
  const resp = await fetch(TOKEN_ENDPOINT);
  if (!resp.ok) {
    throw new Error(`Failed to get token: ${resp.status}`);
  }
  
  const data = await resp.json();
  const newToken = {
    token: data.token,
    expiresAt: data.expiresAt,
    lastUsed: now,
  };
  
  tokenPool.push(newToken);
  return newToken.token;
}

/**
 * 強制刷新 Token 池 (遇到 429 時調用)
 */
async function forceRefreshTokens(count = 3) {
  const newTokens = [];
  for (let i = 0; i < count; i++) {
    try {
      const resp = await fetch(TOKEN_ENDPOINT);
      if (resp.ok) {
        const data = await resp.json();
        newTokens.push({
          token: data.token,
          expiresAt: data.expiresAt,
          lastUsed: 0,
        });
      }
    } catch (e) {
      // 忽略單個失敗
    }
    // 小延遲避免被限流
    if (i < count - 1) {
      await new Promise(r => setTimeout(r, 100));
    }
  }
  
  if (newTokens.length > 0) {
    tokenPool = newTokens;
  }
  
  return newTokens.length;
}

// ============================================================
// API Key 認證
// ============================================================

function validateApiKey(request, env) {
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader) {
    return { valid: false, error: 'Missing Authorization header' };
  }
  
  // 支持 Bearer token 和 X-Api-Key
  let apiKey = null;
  if (authHeader.startsWith('Bearer ')) {
    apiKey = authHeader.slice(7);
  } else if (request.headers.get('X-Api-Key')) {
    apiKey = request.headers.get('X-Api-Key');
  }
  
  if (!apiKey) {
    return { valid: false, error: 'Invalid Authorization format' };
  }
  
  // 驗證 API Key (從環境變量讀取)
  const validKeys = (env.API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);
  
  if (validKeys.length === 0) {
    // 如果沒有設置 API Keys，允許所有 (開發模式)
    return { valid: true, key: apiKey };
  }
  
  if (!validKeys.includes(apiKey)) {
    return { valid: false, error: 'Invalid API key' };
  }
  
  return { valid: true, key: apiKey };
}

// ============================================================
// Rate Limiting (使用 KV)
// ============================================================

async function checkRateLimit(apiKey, env) {
  if (!env.RATE_LIMIT_KV) return { allowed: true };
  
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 分鐘窗口
  const maxRequests = parseInt(env.RATE_LIMIT_PER_MINUTE || '10');
  
  const key = `rl:${apiKey}:${Math.floor(now / windowMs)}`;
  
  try {
    const current = parseInt(await env.RATE_LIMIT_KV.get(key) || '0');
    if (current >= maxRequests) {
      return { 
        allowed: false, 
        error: `Rate limit exceeded. Max ${maxRequests} requests per minute.`,
        retryAfter: Math.ceil((windowMs - (now % windowMs)) / 1000)
      };
    }
    
    await env.RATE_LIMIT_KV.put(key, String(current + 1), { expirationTtl: 120 });
    return { allowed: true, remaining: maxRequests - current - 1 };
  } catch {
    return { allowed: true };
  }
}

// ============================================================
// OpenAI 相容響應格式
// ============================================================

function openaiImageResponse(images, model) {
  return {
    created: Math.floor(Date.now() / 1000),
    data: images.map((img, i) => ({
      url: img.url || `data:image/png;base64,${img.b64_json}`,
      revised_prompt: img.revised_prompt || null,
      index: i,
    })),
    model: model,
  };
}

function openaiErrorResponse(status, message, type = 'invalid_request_error') {
  return {
    error: {
      message,
      type,
      code: status,
      param: null,
    },
  };
}

// ============================================================
// 主路由
// ============================================================

async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  
  // CORS Headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Api-Key',
    'Access-Control-Max-Age': '86400',
  };
  
  // OPTIONS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  // ============================================================
  // GET / - API 信息
  // ============================================================
  if (url.pathname === '/' || url.pathname === '') {
    return Response.json({
      name: 'Claw Hunter Image API',
      version: '1.0.0',
      description: 'OpenAI-compatible image generation API powered by Claw Hunter',
      endpoints: {
        'POST /v1/images/generations': 'Generate images (OpenAI compatible)',
        'GET /v1/models': 'List available models',
        'GET /health': 'Health check',
      },
      models: Object.keys(MODEL_PRICES),
      pricing: MODEL_PRICES,
    }, { headers: corsHeaders });
  }
  
  // ============================================================
  // GET /health - 健康檢查
  // ============================================================
  if (url.pathname === '/health') {
    try {
      await getStudioToken();
      const now = Math.floor(Date.now() / 1000);
      const validTokens = tokenPool.filter(t => t.expiresAt - 60 > now).length;
      return Response.json({ 
        status: 'ok', 
        tokens: { pool: tokenPool.length, valid: validTokens },
        note: 'CF Workers natural IP rotation enabled'
      }, { headers: corsHeaders });
    } catch (e) {
      return Response.json({ status: 'error', message: e.message }, { 
        status: 503, headers: corsHeaders 
      });
    }
  }
  
  // ============================================================
  // POST /admin/refresh-tokens - 強制刷新 Token 池 (管理員)
  // ============================================================
  if (url.pathname === '/admin/refresh-tokens' && request.method === 'POST') {
    const auth = validateApiKey(request, env);
    if (!auth.valid) {
      return Response.json(
        openaiErrorResponse(401, 'Admin access required'),
        { status: 401, headers: corsHeaders }
      );
    }
    
    const count = await forceRefreshTokens(5);
    return Response.json({
      status: 'ok',
      refreshed: count,
      pool: tokenPool.length,
    }, { headers: corsHeaders });
  }
  
  // ============================================================
  // GET /v1/models - 列出模型
  // ============================================================
  if (url.pathname === '/v1/models') {
    const models = Object.entries(MODEL_PRICES).map(([id, price]) => ({
      id,
      object: 'model',
      created: 1700000000,
      owned_by: 'clawhunter',
      pricing: {
        prompt: '0',
        completion: '0',
        image: price,
      },
    }));
    
    return Response.json({
      object: 'list',
      data: models,
    }, { headers: corsHeaders });
  }
  
  // ============================================================
  // POST /v1/images/generations - 圖片生成 (OpenAI 相容)
  // ============================================================
  if (url.pathname === '/v1/images/generations' && request.method === 'POST') {
    // 1. 驗證 API Key
    const auth = validateApiKey(request, env);
    if (!auth.valid) {
      return Response.json(
        openaiErrorResponse(401, auth.error),
        { status: 401, headers: corsHeaders }
      );
    }
    
    // 2. Rate Limiting
    const rl = await checkRateLimit(auth.key, env);
    if (!rl.allowed) {
      return Response.json(
        openaiErrorResponse(429, rl.error),
        { 
          status: 429, 
          headers: { ...corsHeaders, 'Retry-After': String(rl.retryAfter || 60) }
        }
      );
    }
    
    // 3. 解析請求體
    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        openaiErrorResponse(400, 'Invalid JSON body'),
        { status: 400, headers: corsHeaders }
      );
    }
    
    const {
      model = 'z-image-turbo',
      prompt,
      n = 1,
      size = '1024x1024',
      quality = 'standard',
      style = 'vivid',
      response_format = 'url',
    } = body;
    
    if (!prompt) {
      return Response.json(
        openaiErrorResponse(400, 'prompt is required'),
        { status: 400, headers: corsHeaders }
      );
    }
    
    // 4. 映射模型 ID
    const clawModel = FREE_MODELS[model] || model;
    
    // 5. 映射參數
    let aspect_ratio = '1:1';
    if (size) {
      const [w, h] = size.split('x').map(Number);
      if (w && h) {
        if (w > h) aspect_ratio = '16:9';
        else if (w < h) aspect_ratio = '9:16';
        else aspect_ratio = '1:1';
      }
    }
    
    // 映射 quality
    let clawQuality = 'medium';
    if (quality === 'low') clawQuality = 'low';
    else if (quality === 'high' || quality === 'hd') clawQuality = 'high';
    
    // 6. 構建 Claw Hunter 請求
    const clawBody = {
      prompt,
      model: clawModel,
      n: Math.min(n, 4),
      aspect_ratio,
      quality: clawQuality,
    };
    
    // 7. 獲取 Token 並發送請求 (帶重試)
    try {
      let lastError = null;
      const maxRetries = 3;
      
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const token = await getStudioToken();
        
        const clawResp = await fetch(IMAGE_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-studio-token': token,
          },
          body: JSON.stringify(clawBody),
        });
        
        if (clawResp.ok) {
          // 成功，繼續處理
          lastError = null;
          const clawData = await clawResp.json();
          
          if (!clawData.images || clawData.images.length === 0) {
            return Response.json(
              openaiErrorResponse(500, 'No images generated'),
              { status: 500, headers: corsHeaders }
            );
          }
          
          // 轉換為 OpenAI 格式
          const images = clawData.images.map(img => ({
            url: img.url,
            b64_json: response_format === 'b64_json' 
              ? img.url.split(',')[1] 
              : undefined,
          }));
          
          const response = openaiImageResponse(images, model);
          
          // 添加自定義頭
          const respHeaders = {
            ...corsHeaders,
            'X-Claw-Model': clawData.billing?.model || clawModel,
            'X-Claw-Cost': String(clawData.billing?.usd || 0),
            'X-Claw-Note': clawData.billing?.note || '',
            'X-Retry-Attempt': String(attempt),
          };
          
          if (rl.remaining !== undefined) {
            respHeaders['X-RateLimit-Remaining'] = String(rl.remaining);
          }
          
          return Response.json(response, { headers: respHeaders });
          
        } else if (clawResp.status === 429) {
          // 限流 - 嘗試刷新 token 池
          const errData = await clawResp.json().catch(() => ({}));
          lastError = errData.error || `Rate limited (429)`;
          
          // 強制刷新 token 池
          await forceRefreshTokens(3);
          
          // 等待一小段時間再重試
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
          continue;
          
        } else {
          // 其他錯誤
          const errData = await clawResp.json().catch(() => ({}));
          return Response.json(
            openaiErrorResponse(
              clawResp.status,
              errData.error || `Claw Hunter API error: ${clawResp.status}`
            ),
            { status: clawResp.status, headers: corsHeaders }
          );
        }
      }
      
      // 重試用完
      if (lastError) {
        return Response.json(
          openaiErrorResponse(429, `${lastError} - all retries exhausted`),
          { status: 429, headers: corsHeaders }
        );
      }
      
      const clawData = await clawResp.json();
      
      if (!clawData.images || clawData.images.length === 0) {
        return Response.json(
          openaiErrorResponse(500, 'No images generated'),
          { status: 500, headers: corsHeaders }
        );
      }
      
      // 8. 轉換為 OpenAI 格式
      const images = clawData.images.map(img => ({
        url: img.url,
        b64_json: response_format === 'b64_json' 
          ? img.url.split(',')[1] 
          : undefined,
      }));
      
      const response = openaiImageResponse(images, model);
      
      // 9. 添加自定義頭
      const respHeaders = {
        ...corsHeaders,
        'X-Claw-Model': clawData.billing?.model || clawModel,
        'X-Claw-Cost': String(clawData.billing?.usd || 0),
        'X-Claw-Note': clawData.billing?.note || '',
      };
      
      if (rl.remaining !== undefined) {
        respHeaders['X-RateLimit-Remaining'] = String(rl.remaining);
      }
      
      return Response.json(response, { headers: respHeaders });
      
    } catch (e) {
      return Response.json(
        openaiErrorResponse(500, `Internal error: ${e.message}`),
        { status: 500, headers: corsHeaders }
      );
    }
  }
  
  // ============================================================
  // 404
  // ============================================================
  return Response.json(
    openaiErrorResponse(404, `Not found: ${url.pathname}`),
    { status: 404, headers: corsHeaders }
  );
}

// ============================================================
// Worker 入口
// ============================================================

export default {
  async fetch(request, env, ctx) {
    try {
      return await handleRequest(request, env, ctx);
    } catch (e) {
      return Response.json(
        openaiErrorResponse(500, `Worker error: ${e.message}`),
        { status: 500 }
      );
    }
  },
};
