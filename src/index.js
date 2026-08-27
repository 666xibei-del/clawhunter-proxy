/**
 * Claw Hunter Free Image API Proxy
 * Cloudflare Worker - Web UI + OpenAI API
 * Free-tier models only
 */

var BASE = "https://clawhunter.fun";
var TOKEN_URL = BASE + "/api/v1/studio/token";
var IMAGE_URL = BASE + "/api/studio/images";

var MODELS = [
  { id: "gpt-image-2",     name: "GPT Image 2",     provider: "OpenAI",  cost: 0, tag: "FREE", freeRes: "1K" },
  { id: "nano-banana-2",   name: "Nano Banana 2",   provider: "Google",  cost: 0, tag: "FREE", freeRes: "1K" },
  { id: "kling-v3",        name: "Kling V3",        provider: "Kuaishou", cost: 0, tag: "FREE" }
];

var pool = [];

async function getToken() {
  var now = Date.now() / 1000 | 0;
  pool = pool.filter(function(t) { return t.exp - 120 > now; });
  if (pool.length > 0) {
    pool.sort(function(a, b) { return a.used - b.used; });
    pool[0].used = now;
    return pool[0].tok;
  }
  var r = await fetch(TOKEN_URL);
  var d = await r.json();
  pool.push({ tok: d.token, exp: d.expiresAt, used: now });
  return d.token;
}

async function refreshPool(count) {
  for (var i = 0; i < (count || 3); i++) {
    try {
      var r = await fetch(TOKEN_URL);
      var d = await r.json();
      pool.push({ tok: d.token, exp: d.expiresAt, used: 0 });
    } catch(e) {}
  }
}

function jsonResp(data, code, headers) {
  return new Response(JSON.stringify(data), {
    status: code || 200,
    headers: Object.assign({ "Content-Type": "application/json" }, headers || {})
  });
}

function errResp(code, msg) {
  return jsonResp({ error: { message: msg, type: "invalid_request_error", code: code } }, code);
}

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}

/* ─── Client-side JS (no single quotes in output) ─── */

function getClientJS() {
  var modelJSON = JSON.stringify(MODELS);
  return [
    "var MODELS = " + modelJSON + ";",
    "var selModel = \"z-image-turbo\", selAR = \"1:1\", selQ = \"medium\";",
    "",
    "function renderModels() {",
    "  var grid = document.getElementById(\"modelGrid\");",
    "  grid.innerHTML = MODELS.map(function(m) {",
    "    var active = m.id === selModel ? \" active\" : \"\";",
    "    var badge = m.freeRes ? \" (\" + m.freeRes + \")\" : \"\";",
    "    return \"<button class=\\\"model-card\" + active + \"\\\" data-mid=\\\"\" + m.id + \"\\\">\" +",
    "      \"<div class=\\\"mn\\\">\" + m.name + badge + \"</div>\" +",
    "      \"<div class=\\\"mp\\\">\" + m.provider + \" - \" + m.tag + \"</div>\" +",
    "      \"<div class=\\\"mc\\\">FREE</div></button>\";",
    "  }).join(\"\");",
    "}",
    "",
    "function pickModel(id) {",
    "  selModel = id;",
    "  document.querySelectorAll(\".model-card\").forEach(function(el) {",
    "    el.classList.toggle(\"active\", el.getAttribute(\"data-mid\") === id);",
    "  });",
    "}",
    "",
    "document.getElementById(\"arOpts\").addEventListener(\"click\", function(e) {",
    "  var btn = e.target.closest(\".opt-btn\");",
    "  if (!btn) return;",
    "  selAR = btn.getAttribute(\"data-val\");",
    "  document.querySelectorAll(\"#arOpts .opt-btn\").forEach(function(b) { b.classList.remove(\"active\"); });",
    "  btn.classList.add(\"active\");",
    "});",
    "",
    "document.getElementById(\"qOpts\").addEventListener(\"click\", function(e) {",
    "  var btn = e.target.closest(\".opt-btn\");",
    "  if (!btn) return;",
    "  selQ = btn.getAttribute(\"data-val\");",
    "  document.querySelectorAll(\"#qOpts .opt-btn\").forEach(function(b) { b.classList.remove(\"active\"); });",
    "  btn.classList.add(\"active\");",
    "});",
    "",
    "document.getElementById(\"modelGrid\").addEventListener(\"click\", function(e) {",
    "  var card = e.target.closest(\".model-card\");",
    "  if (!card) return;",
    "  pickModel(card.getAttribute(\"data-mid\"));",
    "});",
    "",
    "function showStatus(msg, type) {",
    "  var el = document.getElementById(\"status\");",
    "  el.textContent = msg;",
    "  el.className = \"status show \" + type;",
    "}",
    "",
    "async function generate() {",
    "  var prompt = document.getElementById(\"prompt\").value.trim();",
    "  if (!prompt) { showStatus(\"Please enter a prompt\", \"err\"); return; }",
    "  var btn = document.getElementById(\"genBtn\");",
    "  var preview = document.getElementById(\"preview\");",
    "  btn.disabled = true;",
    "  btn.innerHTML = \"Generating...\";",
    "  preview.innerHTML = \"<div class=\\\"loading\\\"><div class=\\\"spinner\\\"></div></div>\";",
    "  try {",
    "    var sizeMap = {\"1:1\":\"1024x1024\",\"16:9\":\"1792x1024\",\"9:16\":\"1024x1792\",\"4:3\":\"1024x768\",\"3:4\":\"768x1024\"};",
    "    var size = sizeMap[selAR] || \"1024x1024\";",
    "    var resp = await fetch(\"/v1/images/generations\", {",
    "      method: \"POST\",",
    "      headers: {\"Content-Type\":\"application/json\",\"Authorization\":\"Bearer free\"},",
    "      body: JSON.stringify({ model: selModel, prompt: prompt, n: 1, quality: selQ, size: size })",
    "    });",
    "    var data = await resp.json();",
    "    if (data.error) throw new Error(data.error.message || data.error || \"Unknown error\");",
    "    if (data.data && data.data.length > 0) {",
    "      var url = data.data[0].url;",
    "      preview.innerHTML = \"<img src=\\\"\" + url + \"\\\" alt=\\\"Generated\\\">\";",
    "      var cost = resp.headers.get(\"X-Claw-Cost\") || \"0\";",
    "      showStatus(\"OK! Cost: $\" + parseFloat(cost).toFixed(4) + \" | Model: \" + (resp.headers.get(\"X-Claw-Model\") || selModel), \"ok\");",
    "    }",
    "  } catch(e) {",
    "    preview.innerHTML = \"<div class=\\\"placeholder\\\"><div class=\\\"icon\\\">Error</div><p>\" + e.message + \"</p></div>\";",
    "    showStatus(\"Error: \" + e.message, \"err\");",
    "  } finally {",
    "    btn.disabled = false;",
    "    btn.innerHTML = \"Generate\";",
    "  }",
    "}",
    "",
    "document.getElementById(\"prompt\").addEventListener(\"keydown\", function(e) {",
    "  if (e.key === \"Enter\" && (e.ctrlKey || e.metaKey)) generate();",
    "});",
    "",
    "renderModels();"
  ].join("\n");
}

/* ─── HTML page (references /app.js) ─── */

function getHTML() {
  return [
    '<!DOCTYPE html>',
    '<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>Claw Hunter - Free Image Gen</title><style>',
    '*{margin:0;padding:0;box-sizing:border-box}',
    ':root{--bg:#0a0a0f;--card:#12121a;--border:#1e1e2e;--accent:#6366f1;--accent2:#818cf8;--text:#e2e8f0;--muted:#64748b;--green:#22c55e;--red:#ef4444}',
    'body{font-family:system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--text);min-height:100vh}',
    '.wrap{max-width:1000px;margin:0 auto;padding:20px}',
    'header{text-align:center;padding:30px 0;border-bottom:1px solid var(--border)}',
    'header h1{font-size:28px;margin-bottom:8px}',
    'header h1 span{color:var(--accent)}',
    'header p{color:var(--muted);font-size:14px}',
    '.badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:rgba(34,197,94,.15);color:var(--green)}',
    '.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:24px}',
    '@media(max-width:768px){.grid{grid-template-columns:1fr}}',
    '.panel{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px}',
    '.panel h2{font-size:16px;margin-bottom:16px}',
    '.field{margin-bottom:16px}',
    '.field label{display:block;font-size:13px;color:var(--muted);margin-bottom:6px}',
    '.field textarea{width:100%;padding:10px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:14px;outline:none;min-height:100px;resize:vertical}',
    '.field textarea:focus{border-color:var(--accent)}',
    '.model-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
    '.model-card{padding:10px;border:1px solid var(--border);border-radius:8px;cursor:pointer;background:transparent;color:var(--text);text-align:left}',
    '.model-card:hover{border-color:var(--accent)}',
    '.model-card.active{border-color:var(--accent);background:rgba(99,102,241,.1)}',
    '.model-card .mn{font-size:13px;font-weight:600}',
    '.model-card .mp{font-size:11px;color:var(--muted);margin-top:2px}',
    '.model-card .mc{font-size:11px;color:var(--green);font-weight:600}',
    '.model-card .mn .free{color:var(--green);font-weight:700}',
    '.opts{display:flex;gap:8px;flex-wrap:wrap}',
    '.opt-btn{padding:6px 12px;border:1px solid var(--border);border-radius:6px;background:transparent;color:var(--text);font-size:12px;cursor:pointer}',
    '.opt-btn:hover{border-color:var(--accent)}',
    '.opt-btn.active{background:var(--accent);border-color:var(--accent);color:white}',
    '.gen-btn{padding:12px 24px;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;width:100%;background:var(--accent);color:white}',
    '.gen-btn:hover{background:var(--accent2)}',
    '.gen-btn:disabled{opacity:.5;cursor:not-allowed}',
    '.preview{min-height:300px;display:flex;align-items:center;justify-content:center;border:2px dashed var(--border);border-radius:12px;overflow:hidden;position:relative}',
    '.preview img{max-width:100%;max-height:500px;object-fit:contain;border-radius:8px}',
    '.placeholder{text-align:center;color:var(--muted)}',
    '.placeholder .icon{font-size:48px;margin-bottom:8px}',
    '.loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.7)}',
    '.spinner{width:40px;height:40px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite}',
    '@keyframes spin{to{transform:rotate(360deg)}}',
    '.status{margin-top:12px;padding:10px;border-radius:8px;font-size:13px;display:none}',
    '.status.show{display:block}',
    '.status.ok{background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);color:var(--green)}',
    '.status.err{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:var(--red)}',
    '.api-info{margin-top:24px;padding:16px;background:var(--card);border:1px solid var(--border);border-radius:12px}',
    '.api-info h3{font-size:14px;margin-bottom:12px}',
    '.api-info pre{background:var(--bg);padding:12px;border-radius:8px;overflow-x:auto;font-size:12px;line-height:1.6}',
    '</style></head><body>',
    '<header><h1>&#128062; <span>Claw Hunter</span> Free Image Gen</h1>',
    '<p>OpenAI Compatible API | 3 Free Models | CF Workers Global</p></header>',
    '<div class="wrap"><div class="grid">',
    '<div class="panel"><h2>&#9997;&#65039; Input</h2>',
    '<div class="field"><label>Prompt</label><textarea id="prompt" placeholder="Describe the image you want to generate..."></textarea></div>',
    '<div class="field"><label>Model <span class="badge">FREE</span></label><div class="model-grid" id="modelGrid"></div></div>',
    '<div class="field"><label>Aspect Ratio</label><div class="opts" id="arOpts">',
    '<button class="opt-btn active" data-val="1:1">1:1</button>',
    '<button class="opt-btn" data-val="16:9">16:9</button>',
    '<button class="opt-btn" data-val="9:16">9:16</button>',
    '<button class="opt-btn" data-val="4:3">4:3</button>',
    '<button class="opt-btn" data-val="3:4">3:4</button>',
    '</div></div>',
    '<div class="field"><label>Quality</label><div class="opts" id="qOpts">',
    '<button class="opt-btn" data-val="low">Low</button>',
    '<button class="opt-btn active" data-val="medium">Medium</button>',
    '<button class="opt-btn" data-val="high">High</button>',
    '</div></div>',
    '<button class="gen-btn" id="genBtn">&#127912; Generate</button>',
    '<div class="status" id="status"></div></div>',
    '<div class="panel"><h2>&#128444;&#65039; Preview</h2>',
    '<div class="preview" id="preview"><div class="placeholder"><div class="icon">&#127912;</div><p>Enter prompt and click Generate</p></div></div>',
    '</div></div>',
    '<div class="api-info"><h3>&#128225; API Usage (Python)</h3>',
    '<pre><code>from openai import OpenAI\n\nclient = OpenAI(\n  base_url="https://YOUR-WORKER.workers.dev/v1",\n  api_key="your-key"\n)\n\nresp = client.images.generate(\n  model="z-image-turbo",\n  prompt="A cute cat", n=1\n)\nprint(resp.data[0].url)</code></pre></div></div>',
    '<script src="/app.js"></script></body></html>'
  ].join("\n");
}

/* ─── Request Handler ─── */

async function handleRequest(request, env) {
  var url = new URL(request.url);
  var C = cors();

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: C });

  // Web UI HTML
  if (url.pathname === "/") {
    return new Response(getHTML(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  // Client JS
  if (url.pathname === "/app.js") {
    return new Response(getClientJS(), { headers: { "Content-Type": "application/javascript; charset=utf-8" } });
  }

  // Health check
  if (url.pathname === "/health") {
    try {
      await getToken();
      return jsonResp({ status: "ok", token_pool: pool.length, models: MODELS.map(function(m) { return m.id; }) }, 200, C);
    } catch(e) {
      return jsonResp({ status: "error", msg: e.message }, 503, C);
    }
  }

  // Admin: refresh token pool
  if (url.pathname === "/admin/refresh-tokens" && request.method === "POST") {
    await refreshPool(5);
    return jsonResp({ status: "ok", pool_size: pool.length }, 200, C);
  }

  // List models (OpenAI compatible)
  if (url.pathname === "/v1/models") {
    var list = MODELS.map(function(m) {
      return { id: m.id, object: "model", owned_by: "clawhunter-free", pricing: { image: m.cost } };
    });
    return jsonResp({ object: "list", data: list }, 200, C);
  }

  // Image generation (OpenAI compatible)
  if (url.pathname === "/v1/images/generations" && request.method === "POST") {
    var body;
    try { body = await request.json(); } catch(e) { return errResp(400, "Invalid JSON body"); }

    var model = body.model || "z-image-turbo";
    var prompt = body.prompt;
    var n = Math.min(body.n || 1, 4);
    var quality = body.quality || "medium";

    if (!prompt) return errResp(400, "prompt is required");

    var modelIds = MODELS.map(function(m) { return m.id; });
    if (modelIds.indexOf(model) === -1) {
      return errResp(400, "Model not available. Free models: " + modelIds.join(", "));
    }

    // Map OpenAI size to aspect ratio
    var ar = "1:1";
    if (body.size) {
      var wh = body.size.split("x").map(Number);
      if (wh[0] > wh[1]) ar = "16:9";
      else if (wh[0] < wh[1]) ar = "9:16";
    }

    var clawReq = { prompt: prompt, model: model, n: n, aspect_ratio: ar, quality: quality };

    // Retry up to 3 times on 429
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        var tok = await getToken();
        var clawResp = await fetch(IMAGE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-studio-token": tok },
          body: JSON.stringify(clawReq)
        });

        if (clawResp.ok) {
          var clawData = await clawResp.json();
          if (clawData.error) {
            var errMsg = typeof clawData.error === "string" ? clawData.error : (clawData.error.message || "Claw Hunter error");
            var retry = clawData.retry_after_seconds || 0;
            if (retry > 0) errMsg += " (retry in " + Math.ceil(retry / 60) + " min)";
            if (attempt < 2) { await refreshPool(3); await new Promise(function(r) { setTimeout(r, 1000); }); continue; }
            return errResp(429, errMsg);
          }
          if (!clawData.images || !clawData.images.length) {
            return errResp(500, "No images returned");
          }

          var billing = clawData.billing || {};
          var resultData = clawData.images.map(function(img) {
            return { url: img.url || ("data:image/png;base64," + img.b64_json) };
          });

          return jsonResp({
            created: Math.floor(Date.now() / 1000),
            data: resultData,
            model: model
          }, 200, Object.assign({
            "X-Claw-Model": billing.model || model,
            "X-Claw-Cost": String(billing.usd || 0),
            "X-Claw-Note": billing.note || ""
          }, C));
        }

        // Rate limited - refresh token pool and retry
        if (clawResp.status === 429) {
          await refreshPool(3);
          await new Promise(function(r) { setTimeout(r, 500 * (attempt + 1)); });
          continue;
        }

        var errBody = await clawResp.json().catch(function() { return {}; });
        return errResp(clawResp.status, errBody.error || "Claw Hunter API error");

      } catch(e) {
        return errResp(500, "Internal error: " + e.message);
      }
    }

    return errResp(429, "Rate limited after retries. Try again later.");
  }

  return errResp(404, "Not found");
}

export default {
  fetch: async function(request, env, ctx) {
    try {
      return await handleRequest(request, env);
    } catch(e) {
      return errResp(500, "Worker error: " + e.message);
    }
  }
};
