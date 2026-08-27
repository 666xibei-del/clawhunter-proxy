/**
 * Claw Hunter Free Image API Proxy
 * Cloudflare Worker - Web UI + OpenAI API
 * 3 free models + Image-to-Image + Drag & Drop + Lightbox
 */

var BASE = "https://clawhunter.fun";
var TOKEN_URL = BASE + "/api/v1/studio/token";
var IMAGE_URL = BASE + "/api/studio/images";

var MODELS = [
  { id: "gpt-image-2",     name: "GPT Image 2",     provider: "OpenAI",  cost: 0, tag: "FREE", freeRes: "1K", edit: true },
  { id: "nano-banana-2",   name: "Nano Banana 2",   provider: "Google",  cost: 0, tag: "FREE", freeRes: "1K", edit: true },
  { id: "kling-v3",        name: "Kling V3",        provider: "Kuaishou", cost: 0, tag: "FREE", edit: false }
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

function getClientJS() {
  var modelJSON = JSON.stringify(MODELS);
  var L = [];
  L.push("var MODELS = " + modelJSON + ";");
  L.push("var selModel = MODELS[0].id, selAR = '1:1', selQ = 'medium';");
  L.push("var refImage = null;");
  L.push("");
  L.push("function renderModels() {");
  L.push("  var grid = document.getElementById('modelGrid');");
  L.push("  grid.innerHTML = '';");
  L.push("  MODELS.forEach(function(m) {");
  L.push("    var btn = document.createElement('button');");
  L.push("    btn.className = 'model-card' + (m.id === selModel ? ' active' : '');");
  L.push("    btn.setAttribute('data-mid', m.id);");
  L.push("    var badge = m.freeRes ? ' (' + m.freeRes + ')' : '';");
  L.push("    var editTag = m.edit ? ' +Edit' : '';");
  L.push("    var mn = document.createElement('div');");
  L.push("    mn.className = 'mn';");
  L.push("    mn.textContent = m.name + badge;");
  L.push("    btn.appendChild(mn);");
  L.push("    var mp = document.createElement('div');");
  L.push("    mp.className = 'mp';");
  L.push("    mp.textContent = m.provider + ' - ' + m.tag + editTag;");
  L.push("    btn.appendChild(mp);");
  L.push("    var mc = document.createElement('div');");
  L.push("    mc.className = 'mc';");
  L.push("    mc.textContent = 'FREE';");
  L.push("    btn.appendChild(mc);");
  L.push("    grid.appendChild(btn);");
  L.push("  });");
  L.push("  updateImageSection();");
  L.push("}");
  L.push("");
  L.push("function updateImageSection() {");
  L.push("  var m = MODELS.find(function(x) { return x.id === selModel; });");
  L.push("  var section = document.getElementById('imgSection');");
  L.push("  if (m && m.edit) { section.style.display = 'block'; }");
  L.push("  else { section.style.display = 'none'; refImage = null; }");
  L.push("  var btn = document.getElementById('genBtn');");
  L.push("  if (btn) btn.innerHTML = refImage ? 'Edit Image' : 'Generate';");
  L.push("}");
  L.push("");
  L.push("function pickModel(id) {");
  L.push("  selModel = id;");
  L.push("  document.querySelectorAll('.model-card').forEach(function(el) {");
  L.push("    el.classList.toggle('active', el.getAttribute('data-mid') === id);");
  L.push("  });");
  L.push("  updateImageSection();");
  L.push("}");
  L.push("");
  L.push("function handleImageUpload(e) {");
  L.push("  var file = e.target.files[0];");
  L.push("  if (!file) return;");
  L.push("  if (file.size > 10 * 1024 * 1024) { showStatus('Image too large (max 10MB)', 'err'); return; }");
  L.push("  var reader = new FileReader();");
  L.push("  reader.onload = function(ev) {");
  L.push("    refImage = ev.target.result;");
  L.push("    var preview = document.getElementById('refPreview');");
  L.push("    preview.innerHTML = '';");
  L.push("    var img = document.createElement('img');");
  L.push("    img.src = refImage;");
  L.push("    img.style.cssText = 'max-width:100%;max-height:150px;border-radius:8px;cursor:pointer';");
  L.push("    img.onclick = function() { openLightbox(refImage); };");
  L.push("    preview.appendChild(img);");
  L.push("    var btn = document.getElementById('genBtn');");
  L.push("    if (btn) btn.innerHTML = 'Edit Image';");
  L.push("  };");
  L.push("  reader.readAsDataURL(file);");
  L.push("}");
  L.push("");
  L.push("function removeImage() {");
  L.push("  refImage = null;");
  L.push("  var preview = document.getElementById('refPreview');");
  L.push("  preview.innerHTML = '<p>Click or drag image here</p><p class=hint>PNG, JPEG, WebP | Max 10MB</p>';");
  L.push("  var inp = document.getElementById('imageInput');");
  L.push("  if (inp) inp.value = '';");
  L.push("  var btn = document.getElementById('genBtn');");
  L.push("  if (btn) btn.innerHTML = 'Generate';");
  L.push("}");
  L.push("");
  L.push("function setupDragDrop() {");
  L.push("  var zone = document.getElementById('uploadZone');");
  L.push("  if (!zone) return;");
  L.push("  zone.addEventListener('dragover', function(e) {");
  L.push("    e.preventDefault(); zone.style.borderColor = 'var(--accent)';");
  L.push("  });");
  L.push("  zone.addEventListener('dragleave', function() {");
  L.push("    zone.style.borderColor = '';");
  L.push("  });");
  L.push("  zone.addEventListener('drop', function(e) {");
  L.push("    e.preventDefault(); zone.style.borderColor = '';");
  L.push("    if (e.dataTransfer.files.length > 0)");
  L.push("      handleImageUpload({target:{files:e.dataTransfer.files}});");
  L.push("  });");
  L.push("}");
  L.push("");
  L.push("function openLightbox(src) {");
  L.push("  var lb = document.getElementById('lightbox');");
  L.push("  var img = document.getElementById('lightboxImg');");
  L.push("  img.src = src;");
  L.push("  lb.style.display = 'flex';");
  L.push("  requestAnimationFrame(function() { lb.classList.add('open'); });");
  L.push("  document.body.style.overflow = 'hidden';");
  L.push("}");
  L.push("");
  L.push("function closeLightbox() {");
  L.push("  var lb = document.getElementById('lightbox');");
  L.push("  lb.classList.remove('open');");
  L.push("  setTimeout(function() { lb.style.display = 'none'; }, 260);");
  L.push("  document.body.style.overflow = '';");
  L.push("}");
  L.push("");
  L.push("document.addEventListener('keydown', function(e) {");
  L.push("  if (e.key === 'Escape') closeLightbox();");
  L.push("});");
  L.push("");
  L.push("document.getElementById('arOpts').addEventListener('click', function(e) {");
  L.push("  var btn = e.target.closest('.opt-btn');");
  L.push("  if (!btn) return;");
  L.push("  selAR = btn.getAttribute('data-val');");
  L.push("  document.querySelectorAll('#arOpts .opt-btn').forEach(function(b) { b.classList.remove('active'); });");
  L.push("  btn.classList.add('active');");
  L.push("});");
  L.push("");
  L.push("document.getElementById('qOpts').addEventListener('click', function(e) {");
  L.push("  var btn = e.target.closest('.opt-btn');");
  L.push("  if (!btn) return;");
  L.push("  selQ = btn.getAttribute('data-val');");
  L.push("  document.querySelectorAll('#qOpts .opt-btn').forEach(function(b) { b.classList.remove('active'); });");
  L.push("  btn.classList.add('active');");
  L.push("});");
  L.push("");
  L.push("document.getElementById('modelGrid').addEventListener('click', function(e) {");
  L.push("  var card = e.target.closest('.model-card');");
  L.push("  if (!card) return;");
  L.push("  pickModel(card.getAttribute('data-mid'));");
  L.push("});");
  L.push("");
  L.push("function showStatus(msg, type) {");
  L.push("  var el = document.getElementById('status');");
  L.push("  el.textContent = msg;");
  L.push("  el.className = 'status show ' + type;");
  L.push("}");
  L.push("");
  L.push("async function generate() {");
  L.push("  var prompt = document.getElementById('prompt').value.trim();");
  L.push("  if (!prompt) { showStatus('Please enter a prompt', 'err'); return; }");
  L.push("  var btn = document.getElementById('genBtn');");
  L.push("  var preview = document.getElementById('preview');");
  L.push("  btn.disabled = true;");
  L.push("  btn.innerHTML = 'Generating...';");
  L.push("  var loading = document.createElement('div');");
  L.push("  loading.className = 'loading';");
  L.push("  var spinner = document.createElement('div');");
  L.push("  spinner.className = 'spinner';");
  L.push("  loading.appendChild(spinner);");
  L.push("  preview.innerHTML = '';");
  L.push("  preview.appendChild(loading);");
  L.push("  try {");
  L.push("    var sizeMap = {'1:1':'1024x1024','16:9':'1792x1024','9:16':'1024x1792','4:3':'1024x768','3:4':'768x1024'};");
  L.push("    var size = sizeMap[selAR] || '1024x1024';");
  L.push("    var reqBody = { model: selModel, prompt: prompt, n: 1, quality: selQ, size: size };");
  L.push("    if (refImage) reqBody.image = refImage;");
  L.push("    var resp = await fetch('/v1/images/generations', {");
  L.push("      method: 'POST',");
  L.push("      headers: {'Content-Type':'application/json','Authorization':'Bearer free'},");
  L.push("      body: JSON.stringify(reqBody)");
  L.push("    });");
  L.push("    var data = await resp.json();");
  L.push("    if (data.error) throw new Error(data.error.message || data.error || 'Unknown error');");
  L.push("    if (data.data && data.data.length > 0) {");
  L.push("      var url = data.data[0].url;");
  L.push("      var img = document.createElement('img');");
  L.push("      img.src = url;");
  L.push("      img.alt = 'Generated';");
  L.push("      img.style.cursor = 'pointer';");
  L.push("      img.onclick = function() { openLightbox(url); };");
  L.push("      preview.innerHTML = '';");
  L.push("      preview.appendChild(img);");
  L.push("      var cost = resp.headers.get('X-Claw-Cost') || '0';");
  L.push("      var mode = refImage ? 'Edit' : 'Generate';");
  L.push("      showStatus('OK! ' + mode + ' | Cost: $' + parseFloat(cost).toFixed(4) + ' | Model: ' + (resp.headers.get('X-Claw-Model') || selModel), 'ok');");
  L.push("    }");
  L.push("  } catch(e) {");
  L.push("    preview.innerHTML = '';");
  L.push("    var ph = document.createElement('div');");
  L.push("    ph.className = 'placeholder';");
  L.push("    ph.innerHTML = '<div class=\"icon\">Error</div><p>' + e.message + '</p>';");
  L.push("    preview.appendChild(ph);");
  L.push("    showStatus('Error: ' + e.message, 'err');");
  L.push("  } finally {");
  L.push("    btn.disabled = false;");
  L.push("    btn.innerHTML = refImage ? 'Edit Image' : 'Generate';");
  L.push("  }");
  L.push("}");
  L.push("");
  L.push("document.getElementById('genBtn').addEventListener('click', generate);");
  L.push("document.getElementById('prompt').addEventListener('keydown', function(e) {");
  L.push("  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) generate();");
  L.push("});");
  L.push("");
  L.push("setupDragDrop();");
  L.push("renderModels();");
  return L.join("\n");
}

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
    '.opts{display:flex;gap:8px;flex-wrap:wrap}',
    '.opt-btn{padding:6px 12px;border:1px solid var(--border);border-radius:6px;background:transparent;color:var(--text);font-size:12px;cursor:pointer}',
    '.opt-btn:hover{border-color:var(--accent)}',
    '.opt-btn.active{background:var(--accent);border-color:var(--accent);color:white}',
    '.gen-btn{padding:12px 24px;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;width:100%;background:var(--accent);color:white}',
    '.gen-btn:hover{background:var(--accent2)}',
    '.gen-btn:disabled{opacity:.5;cursor:not-allowed}',
    '.preview{min-height:300px;display:flex;align-items:center;justify-content:center;border:2px dashed var(--border);border-radius:12px;overflow:hidden;position:relative}',
    '.preview img{max-width:100%;max-height:500px;object-fit:contain;border-radius:8px;cursor:pointer;transition:transform .2s}',
    '.preview img:hover{transform:scale(1.02)}',
    '.placeholder{text-align:center;color:var(--muted)}',
    '.placeholder .icon{font-size:48px;margin-bottom:8px}',
    '.loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.7)}',
    '.spinner{width:40px;height:40px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite}',
    '@keyframes spin{to{transform:rotate(360deg)}}',
    '.status{margin-top:12px;padding:10px;border-radius:8px;font-size:13px;display:none}',
    '.status.show{display:block}',
    '.status.ok{background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);color:var(--green)}',
    '.status.err{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:var(--red)}',
    '.upload-zone{border:2px dashed var(--border);border-radius:8px;padding:16px;text-align:center;cursor:pointer;transition:border-color .2s,background .2s}',
    '.upload-zone:hover{border-color:var(--accent)}',
    '.upload-zone input{display:none}',
    '.upload-zone .hint{font-size:11px;color:var(--muted);margin-top:4px}',
    '.ref-actions{display:flex;gap:8px;margin-top:8px}',
    '.ref-btn{padding:4px 10px;border:1px solid var(--border);border-radius:6px;background:transparent;color:var(--muted);font-size:11px;cursor:pointer}',
    '.ref-btn:hover{border-color:var(--red);color:var(--red)}',
    '.api-info{margin-top:24px;padding:16px;background:var(--card);border:1px solid var(--border);border-radius:12px}',
    '.api-info h3{font-size:14px;margin-bottom:12px}',
    '.api-info pre{background:var(--bg);padding:12px;border-radius:8px;overflow-x:auto;font-size:12px;line-height:1.6}',
    '.lightbox{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.92);cursor:zoom-out;opacity:0;transition:opacity .25s ease}',
    '.lightbox.open{display:flex;opacity:1}',
    '.lightbox img{max-width:92vw;max-height:92vh;object-fit:contain;border-radius:8px;box-shadow:0 0 80px rgba(0,0,0,.6)}',
    '.lightbox-close{position:absolute;top:20px;right:20px;width:44px;height:44px;border:none;border-radius:50%;background:rgba(255,255,255,.1);color:white;font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .2s;z-index:1}',
    '.lightbox-close:hover{background:rgba(255,255,255,.25)}',
    '.lightbox-hint{position:absolute;bottom:24px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,.4);font-size:12px}',
    '</style></head><body>',
    '<header><h1>&#128062; <span>Claw Hunter</span> Free Image Gen</h1>',
    '<p>OpenAI Compatible API | 3 Free Models | Text-to-Image + Image-to-Image</p></header>',
    '<div class="wrap"><div class="grid">',
    '<div class="panel"><h2>&#9997;&#65039; Input</h2>',
    '<div class="field"><label>Prompt</label><textarea id="prompt" placeholder="Describe the image you want to generate..."></textarea></div>',
    '<div class="field"><label>Model <span class="badge">FREE</span></label><div class="model-grid" id="modelGrid"></div></div>',
    '<div class="field" id="imgSection" style="display:none"><label>Reference Image (Edit)</label>',
    '<div class="upload-zone" id="uploadZone" onclick="document.getElementById(\'imageInput\').click()">',
    '<input type="file" id="imageInput" accept="image/png,image/jpeg,image/webp" onchange="handleImageUpload(event)">',
    '<div id="refPreview"><p>&#128247; Click or drag image here</p><p class="hint">PNG, JPEG, WebP | Max 10MB</p></div></div>',
    '<div class="ref-actions"><button class="ref-btn" onclick="removeImage()">Remove</button></div></div>',
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
    '<pre><code>from openai import OpenAI\n\nclient = OpenAI(\n  base_url="https://YOUR-WORKER.workers.dev/v1",\n  api_key="your-key"\n)\n\n# Text-to-Image\nresp = client.images.generate(\n  model="gpt-image-2",\n  prompt="A cute cat", n=1\n)\n\n# Image-to-Image\nimport base64\nwith open("input.png", "rb") as f:\n  img_b64 = "data:image/png;base64," + base64.b64encode(f.read()).decode()\nresp = client.images.generate(\n  model="gpt-image-2",\n  prompt="Add sunglasses",\n  extra_body={"image": img_b64}\n)\nprint(resp.data[0].url)</code></pre></div></div>',
    '<div id="lightbox" onclick="closeLightbox()">',
    '<button class="lightbox-close" onclick="event.stopPropagation();closeLightbox()">&times;</button>',
    '<img id="lightboxImg" src="" alt="Enlarged" onclick="event.stopPropagation()">',
    '<div class="lightbox-hint">Click outside or press ESC to close</div>',
    '</div>',
    '<script src="/app.js"></script></body></html>'
  ].join("\n");
}

/* ─── Request Handler ─── */

async function handleRequest(request, env) {
  var url = new URL(request.url);
  var C = cors();

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: C });

  if (url.pathname === "/") {
    return new Response(getHTML(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  if (url.pathname === "/app.js") {
    return new Response(getClientJS(), { headers: { "Content-Type": "application/javascript; charset=utf-8" } });
  }

  if (url.pathname === "/health") {
    try {
      await getToken();
      return jsonResp({ status: "ok", token_pool: pool.length, models: MODELS.map(function(m) { return m.id; }) }, 200, C);
    } catch(e) {
      return jsonResp({ status: "error", msg: e.message }, 503, C);
    }
  }

  if (url.pathname === "/admin/refresh-tokens" && request.method === "POST") {
    await refreshPool(5);
    return jsonResp({ status: "ok", pool_size: pool.length }, 200, C);
  }

  if (url.pathname === "/v1/models") {
    var list = MODELS.map(function(m) {
      return { id: m.id, object: "model", owned_by: "clawhunter-free", pricing: { image: m.cost }, capabilities: m.edit ? ["generate", "edit"] : ["generate"] };
    });
    return jsonResp({ object: "list", data: list }, 200, C);
  }

  if (url.pathname === "/v1/images/generations" && request.method === "POST") {
    var body;
    try { body = await request.json(); } catch(e) { return errResp(400, "Invalid JSON body"); }

    var model = body.model || MODELS[0].id;
    var prompt = body.prompt;
    var n = Math.min(body.n || 1, 4);
    var quality = body.quality || "medium";

    if (!prompt) return errResp(400, "prompt is required");

    var modelIds = MODELS.map(function(m) { return m.id; });
    if (modelIds.indexOf(model) === -1) {
      return errResp(400, "Model not available. Free models: " + modelIds.join(", "));
    }

    var ar = "1:1";
    if (body.size) {
      var wh = body.size.split("x").map(Number);
      if (wh[0] > wh[1]) ar = "16:9";
      else if (wh[0] < wh[1]) ar = "9:16";
    }

    var clawReq = { prompt: prompt, model: model, n: n, aspect_ratio: ar, quality: quality };

    // Support multiple image formats: image, image_url, input_images, reference_images
    var refImages = [];
    if (body.image) refImages.push(body.image);
    if (body.image_url) refImages.push(body.image_url);
    if (body.input_images && Array.isArray(body.input_images)) {
      refImages = refImages.concat(body.input_images);
    }
    if (body.reference_images && Array.isArray(body.reference_images)) {
      refImages = refImages.concat(body.reference_images);
    }
    
    if (refImages.length > 0) {
      var modelInfo = MODELS.find(function(m) { return m.id === model; });
      if (!modelInfo || !modelInfo.edit) {
        return errResp(400, "Model " + model + " does not support image editing. Use gpt-image-2 or nano-banana-2.");
      }
      clawReq.image_url = refImages[0];
      if (refImages.length > 1) {
        clawReq.input_images = refImages;
      }
    }

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
