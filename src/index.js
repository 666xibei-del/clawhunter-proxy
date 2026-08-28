/**
 * Claw Hunter Free Image API Proxy
 * Cloudflare Worker - Web UI + OpenAI API
 * 3 free models + Image-to-Image + Drag & Drop + Lightbox
 */

var BASE = "https://clawhunter.fun";
var TOKEN_URL = BASE + "/api/v1/studio/token";
var IMAGE_URL = BASE + "/api/studio/images";

var MODELS = [
  { id: "gpt-image-2", name: "GPT Image 2", provider: "OpenAI", cost: 0, tag: "FREE", freeRes: "1K", edit: true },
  { id: "nano-banana-2", name: "Nano Banana 2", provider: "Google", cost: 0, tag: "FREE", freeRes: "1K", edit: true },
  { id: "kling-v3", name: "Kling V3", provider: "Kuaishou", cost: 0, tag: "FREE", edit: false }
];

var pool = [];

async function getToken() {
  var now = Date.now() / 1000 | 0;
  pool = pool.filter(function(t) { return t.exp - 120 > now; });
  // Proactively refresh if pool is low
  if (pool.length < 3) {
    await refreshPool(5);
  }
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
  var n = count || 5;
  var promises = [];
  for (var i = 0; i < n; i++) {
    promises.push(
      fetch(TOKEN_URL)
        .then(function(r) { return r.json(); })
        .then(function(d) { pool.push({ tok: d.token, exp: d.expiresAt, used: 0 }); })
        .catch(function() {})
    );
  }
  await Promise.all(promises);
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

/* ═══════════════════════════════════════════════
   Client-side JavaScript (served at /app.js)
   No inline onclick - all event delegation
   ═══════════════════════════════════════════════ */

function getClientJS() {
  var modelJSON = JSON.stringify(MODELS);
  var lines = [];

  lines.push("var MODELS = " + modelJSON + ";");
  lines.push("var selModel = MODELS[0].id, selAR = '1:1', selQ = 'medium';");
  lines.push("var refImage = null;");
  lines.push("");

  // ── Model Grid ──
  lines.push("function renderModels() {");
  lines.push("  var grid = document.getElementById('modelGrid');");
  lines.push("  grid.innerHTML = '';");
  lines.push("  MODELS.forEach(function(m) {");
  lines.push("    var btn = document.createElement('button');");
  lines.push("    btn.className = 'model-card' + (m.id === selModel ? ' active' : '');");
  lines.push("    btn.setAttribute('data-mid', m.id);");
  lines.push("    var badge = m.freeRes ? ' (' + m.freeRes + ')' : '';");
  lines.push("    var editTag = m.edit ? ' +Edit' : '';");
  lines.push("    var mn = document.createElement('div');");
  lines.push("    mn.className = 'mn';");
  lines.push("    mn.textContent = m.name + badge;");
  lines.push("    btn.appendChild(mn);");
  lines.push("    var mp = document.createElement('div');");
  lines.push("    mp.className = 'mp';");
  lines.push("    mp.textContent = m.provider + ' - ' + m.tag + editTag;");
  lines.push("    btn.appendChild(mp);");
  lines.push("    var mc = document.createElement('div');");
  lines.push("    mc.className = 'mc';");
  lines.push("    mc.textContent = 'FREE';");
  lines.push("    btn.appendChild(mc);");
  lines.push("    grid.appendChild(btn);");
  lines.push("  });");
  lines.push("  updateImageSection();");
  lines.push("}");
  lines.push("");

  // ── Toggle image section ──
  lines.push("function updateImageSection() {");
  lines.push("  var m = MODELS.find(function(x) { return x.id === selModel; });");
  lines.push("  var section = document.getElementById('imgSection');");
  lines.push("  if (m && m.edit) { section.style.display = ''; }");
  lines.push("  else { section.style.display = 'none'; refImage = null; }");
  lines.push("  updateBtnLabel();");
  lines.push("}");
  lines.push("");

  lines.push("function updateBtnLabel() {");
  lines.push("  var btn = document.getElementById('genBtn');");
  lines.push("  if (btn) btn.textContent = refImage ? 'Edit Image' : 'Generate';");
  lines.push("}");
  lines.push("");

  // ── Pick model ──
  lines.push("function pickModel(id) {");
  lines.push("  selModel = id;");
  lines.push("  document.querySelectorAll('.model-card').forEach(function(el) {");
  lines.push("    el.classList.toggle('active', el.getAttribute('data-mid') === id);");
  lines.push("  });");
  lines.push("  updateImageSection();");
  lines.push("}");
  lines.push("");

  // ── Image upload ──
  lines.push("function handleImageUpload(file) {");
  lines.push("  if (!file) return;");
  lines.push("  if (file.size > 10 * 1024 * 1024) { showStatus('Image too large (max 10MB)', 'err'); return; }");
  lines.push("  var reader = new FileReader();");
  lines.push("  reader.onload = function(ev) {");
  lines.push("    refImage = ev.target.result;");
  lines.push("    var preview = document.getElementById('refPreview');");
  lines.push("    preview.innerHTML = '';");
  lines.push("    var img = document.createElement('img');");
  lines.push("    img.src = refImage;");
  lines.push("    img.className = 'ref-thumb';");
  lines.push("    preview.appendChild(img);");
  lines.push("    updateBtnLabel();");
  lines.push("  };");
  lines.push("  reader.readAsDataURL(file);");
  lines.push("}");
  lines.push("");

  lines.push("function removeImage() {");
  lines.push("  refImage = null;");
  lines.push("  var preview = document.getElementById('refPreview');");
  lines.push("  preview.innerHTML = '<p>Click or drag image here</p><p class=hint>PNG, JPEG, WebP | Max 10MB</p>';");
  lines.push("  var inp = document.getElementById('imageInput');");
  lines.push("  if (inp) inp.value = '';");
  lines.push("  updateBtnLabel();");
  lines.push("}");
  lines.push("");

  // ── Drag & Drop ──
  lines.push("function setupDragDrop() {");
  lines.push("  var zone = document.getElementById('uploadZone');");
  lines.push("  if (!zone) return;");
  lines.push("  zone.addEventListener('dragover', function(e) {");
  lines.push("    e.preventDefault(); zone.classList.add('dragover');");
  lines.push("  });");
  lines.push("  zone.addEventListener('dragleave', function() {");
  lines.push("    zone.classList.remove('dragover');");
  lines.push("  });");
  lines.push("  zone.addEventListener('drop', function(e) {");
  lines.push("    e.preventDefault(); zone.classList.remove('dragover');");
  lines.push("    if (e.dataTransfer.files.length > 0) handleImageUpload(e.dataTransfer.files[0]);");
  lines.push("  });");
  lines.push("}");
  lines.push("");

  // ── Lightbox ──
  lines.push("function openLightbox(src) {");
  lines.push("  var lb = document.getElementById('lightbox');");
  lines.push("  var img = document.getElementById('lbImg');");
  lines.push("  if (!lb || !img) return;");
  lines.push("  img.src = src;");
  lines.push("  lb.style.display = 'flex';");
  lines.push("  requestAnimationFrame(function() { lb.classList.add('open'); });");
  lines.push("  document.body.style.overflow = 'hidden';");
  lines.push("}");
  lines.push("");

  lines.push("function closeLightbox() {");
  lines.push("  var lb = document.getElementById('lightbox');");
  lines.push("  if (!lb) return;");
  lines.push("  lb.classList.remove('open');");
  lines.push("  setTimeout(function() { lb.style.display = 'none'; }, 300);");
  lines.push("  document.body.style.overflow = '';");
  lines.push("}");
  lines.push("");

  // ── Status ──
  lines.push("function showStatus(msg, type) {");
  lines.push("  var el = document.getElementById('status');");
  lines.push("  el.textContent = msg;");
  lines.push("  el.className = 'status show ' + type;");
  lines.push("}");
  lines.push("");

  // ── Generate ──
  lines.push("async function generate() {");
  lines.push("  var prompt = document.getElementById('prompt').value.trim();");
  lines.push("  if (!prompt) { showStatus('Please enter a prompt', 'err'); return; }");
  lines.push("  var btn = document.getElementById('genBtn');");
  lines.push("  var preview = document.getElementById('preview');");
  lines.push("  btn.disabled = true;");
  lines.push("  btn.textContent = 'Generating...';");
  lines.push("  var loading = document.createElement('div');");
  lines.push("  loading.className = 'loading';");
  lines.push("  var spinner = document.createElement('div');");
  lines.push("  spinner.className = 'spinner';");
  lines.push("  loading.appendChild(spinner);");
  lines.push("  preview.innerHTML = '';");
  lines.push("  preview.appendChild(loading);");
  lines.push("  var maxRetries = 3;");
  lines.push("  var lastErr = null;");
  lines.push("  for (var retry = 0; retry <= maxRetries; retry++) {");
  lines.push("    try {");
  lines.push("      if (retry > 0) {");
  lines.push("        var waitSec = retry * 5;");
  lines.push("        showStatus('Retry ' + retry + '/' + maxRetries + ' in ' + waitSec + 's...', 'err');");
  lines.push("        await new Promise(function(r) { setTimeout(r, waitSec * 1000); });");
  lines.push("        btn.textContent = 'Retrying... (' + retry + '/' + maxRetries + ')';");
  lines.push("      }");
  lines.push("      var sizeMap = {'1:1':'1024x1024','16:9':'1792x1024','9:16':'1024x1792','4:3':'1024x768','3:4':'768x1024'};");
  lines.push("      var size = sizeMap[selAR] || '1024x1024';");
  lines.push("      var reqBody = { model: selModel, prompt: prompt, n: 1, quality: selQ, size: size };");
  lines.push("      if (refImage) reqBody.image = refImage;");
  lines.push("      var resp = await fetch('/v1/images/generations', {");
  lines.push("        method: 'POST',");
  lines.push("        headers: {'Content-Type':'application/json','Authorization':'Bearer free'},");
  lines.push("        body: JSON.stringify(reqBody)");
  lines.push("      });");
  lines.push("      var data = await resp.json();");
  lines.push("      if (data.error) {");
  lines.push("        var em = data.error.message || data.error || 'Unknown error';");
  lines.push("        var isRateLimit = resp.status === 429 || em.indexOf('limit') !== -1 || em.indexOf('Rate') !== -1;");
  lines.push("        if (isRateLimit && retry < maxRetries) { showStatus('Rate limited, retrying... (' + (retry+1) + '/' + maxRetries + ')', 'err'); continue; }");
  lines.push("        throw new Error(em);");
  lines.push("      }");
  lines.push("      if (data.data && data.data.length > 0) {");
  lines.push("        var url = data.data[0].url;");
  lines.push("        var img = document.createElement('img');");
  lines.push("        img.src = url;");
  lines.push("        img.alt = 'Generated';");
  lines.push("        img.className = 'gen-img';");
  lines.push("        img.setAttribute('data-src', url);");
  lines.push("        preview.innerHTML = '';");
  lines.push("        preview.appendChild(img);");
  lines.push("        var cost = resp.headers.get('X-Claw-Cost') || '0';");
  lines.push("        var mode = refImage ? 'Edit' : 'Generate';");
  lines.push("        showStatus('OK! ' + mode + ' | Cost: $' + parseFloat(cost).toFixed(4) + ' | Model: ' + (resp.headers.get('X-Claw-Model') || selModel), 'ok');");
  lines.push("      }");
  lines.push("      lastErr = null;");
  lines.push("      break;");
  lines.push("    } catch(e) {");
  lines.push("      lastErr = e;");
  lines.push("    }");
  lines.push("  }");
  lines.push("  if (lastErr) {");
  lines.push("    preview.innerHTML = '';");
  lines.push("    var ph = document.createElement('div');");
  lines.push("    ph.className = 'placeholder';");
  lines.push("    ph.textContent = lastErr.message;");
  lines.push("    preview.appendChild(ph);");
  lines.push("    showStatus('Error: ' + lastErr.message, 'err');");
  lines.push("  }");
  lines.push("  btn.disabled = false;");
  lines.push("  updateBtnLabel();");
  lines.push("}");
  lines.push("");

  // ── Init: all event listeners via delegation ──
  lines.push("document.addEventListener('DOMContentLoaded', function() {");

  // Model grid click
  lines.push("  document.getElementById('modelGrid').addEventListener('click', function(e) {");
  lines.push("    var card = e.target.closest('.model-card');");
  lines.push("    if (card) pickModel(card.getAttribute('data-mid'));");
  lines.push("  });");

  // Aspect ratio
  lines.push("  document.getElementById('arOpts').addEventListener('click', function(e) {");
  lines.push("    var btn = e.target.closest('.opt-btn');");
  lines.push("    if (!btn) return;");
  lines.push("    selAR = btn.getAttribute('data-val');");
  lines.push("    document.querySelectorAll('#arOpts .opt-btn').forEach(function(b) { b.classList.remove('active'); });");
  lines.push("    btn.classList.add('active');");
  lines.push("  });");

  // Quality
  lines.push("  document.getElementById('qOpts').addEventListener('click', function(e) {");
  lines.push("    var btn = e.target.closest('.opt-btn');");
  lines.push("    if (!btn) return;");
  lines.push("    selQ = btn.getAttribute('data-val');");
  lines.push("    document.querySelectorAll('#qOpts .opt-btn').forEach(function(b) { b.classList.remove('active'); });");
  lines.push("    btn.classList.add('active');");
  lines.push("  });");

  // Generate button
  lines.push("  document.getElementById('genBtn').addEventListener('click', generate);");

  // Ctrl+Enter to generate
  lines.push("  document.getElementById('prompt').addEventListener('keydown', function(e) {");
  lines.push("    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) generate();");
  lines.push("  });");

  // Upload zone click -> open file picker
  lines.push("  document.getElementById('uploadZone').addEventListener('click', function(e) {");
  lines.push("    if (e.target.tagName !== 'INPUT') document.getElementById('imageInput').click();");
  lines.push("  });");

  // File input change
  lines.push("  document.getElementById('imageInput').addEventListener('change', function(e) {");
  lines.push("    if (e.target.files.length > 0) handleImageUpload(e.target.files[0]);");
  lines.push("  });");

  // Remove image button
  lines.push("  document.getElementById('removeBtn').addEventListener('click', function(e) {");
  lines.push("    e.stopPropagation();");
  lines.push("    removeImage();");
  lines.push("  });");

  // Ref image click -> lightbox
  lines.push("  document.getElementById('refPreview').addEventListener('click', function(e) {");
  lines.push("    var img = e.target.closest('img');");
  lines.push("    if (img && img.src) openLightbox(img.src);");
  lines.push("  });");

  // Generated image click -> lightbox (delegation on preview div)
  lines.push("  document.getElementById('preview').addEventListener('click', function(e) {");
  lines.push("    var img = e.target.closest('.gen-img');");
  lines.push("    if (img) { var s = img.getAttribute('data-src'); if (s) openLightbox(s); }");
  lines.push("  });");

  // Lightbox close: click backdrop or X button
  lines.push("  document.getElementById('lightbox').addEventListener('click', function(e) {");
  lines.push("    if (e.target === this || e.target.classList.contains('lb-close')) closeLightbox();");
  lines.push("  });");

  // ESC to close lightbox
  lines.push("  document.addEventListener('keydown', function(e) {");
  lines.push("    if (e.key === 'Escape') closeLightbox();");
  lines.push("  });");

  lines.push("  setupDragDrop();");
  lines.push("  renderModels();");
  lines.push("});");

  return lines.join("\n");
}

/* ═══════════════════════════════════════════════
   HTML (served at /)
   No inline onclick handlers
   ═══════════════════════════════════════════════ */

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
    '.model-card{padding:10px;border:1px solid var(--border);border-radius:8px;cursor:pointer;background:transparent;color:var(--text);text-align:left;font-family:inherit}',
    '.model-card:hover{border-color:var(--accent)}',
    '.model-card.active{border-color:var(--accent);background:rgba(99,102,241,.1)}',
    '.model-card .mn{font-size:13px;font-weight:600}',
    '.model-card .mp{font-size:11px;color:var(--muted);margin-top:2px}',
    '.model-card .mc{font-size:11px;color:var(--green);font-weight:600}',
    '.opts{display:flex;gap:8px;flex-wrap:wrap}',
    '.opt-btn{padding:6px 12px;border:1px solid var(--border);border-radius:6px;background:transparent;color:var(--text);font-size:12px;cursor:pointer;font-family:inherit}',
    '.opt-btn:hover{border-color:var(--accent)}',
    '.opt-btn.active{background:var(--accent);border-color:var(--accent);color:white}',
    '.gen-btn{padding:12px 24px;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;width:100%;background:var(--accent);color:white;font-family:inherit}',
    '.gen-btn:hover{background:var(--accent2)}',
    '.gen-btn:disabled{opacity:.5;cursor:not-allowed}',
    '.preview{min-height:300px;display:flex;align-items:center;justify-content:center;border:2px dashed var(--border);border-radius:12px;overflow:hidden;position:relative}',
    '.preview img,.gen-img{max-width:100%;max-height:500px;object-fit:contain;border-radius:8px;cursor:pointer;transition:transform .2s}',
    '.preview img:hover,.gen-img:hover{transform:scale(1.02)}',
    '.placeholder{text-align:center;color:var(--muted);padding:40px}',
    '.loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.7)}',
    '.spinner{width:40px;height:40px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite}',
    '@keyframes spin{to{transform:rotate(360deg)}}',
    '.status{margin-top:12px;padding:10px;border-radius:8px;font-size:13px;display:none}',
    '.status.show{display:block}',
    '.status.ok{background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);color:var(--green)}',
    '.status.err{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:var(--red)}',
    '.upload-zone{border:2px dashed var(--border);border-radius:8px;padding:16px;text-align:center;cursor:pointer;transition:border-color .2s,background .2s}',
    '.upload-zone:hover{border-color:var(--accent)}',
    '.upload-zone.dragover{border-color:var(--accent);background:rgba(99,102,241,.05)}',
    '.upload-zone input{display:none}',
    '.upload-zone .hint{font-size:11px;color:var(--muted);margin-top:4px}',
    '.ref-thumb{max-width:100%;max-height:150px;border-radius:8px;cursor:pointer;display:block;margin:0 auto}',
    '.ref-actions{display:flex;gap:8px;margin-top:8px}',
    '.ref-btn{padding:4px 10px;border:1px solid var(--border);border-radius:6px;background:transparent;color:var(--muted);font-size:11px;cursor:pointer;font-family:inherit}',
    '.ref-btn:hover{border-color:var(--red);color:var(--red)}',
    '.api-info{margin-top:24px;padding:16px;background:var(--card);border:1px solid var(--border);border-radius:12px}',
    '.api-info h3{font-size:14px;margin-bottom:12px}',
    '.api-info pre{background:var(--bg);padding:12px;border-radius:8px;overflow-x:auto;font-size:12px;line-height:1.6}',
    '',
    '/* Lightbox */',
    '.lightbox{display:none;position:fixed;inset:0;z-index:9999;align-items:center;justify-content:center;background:rgba(0,0,0,.92);cursor:zoom-out;opacity:0;transition:opacity .3s ease}',
    '.lightbox.open{opacity:1}',
    '.lightbox img{max-width:92vw;max-height:92vh;object-fit:contain;border-radius:8px;box-shadow:0 0 80px rgba(0,0,0,.6);cursor:default}',
    '.lb-close{position:absolute;top:20px;right:20px;width:44px;height:44px;border:none;border-radius:50%;background:rgba(255,255,255,.1);color:white;font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .2s;z-index:1}',
    '.lb-close:hover{background:rgba(255,255,255,.25)}',
    '.lb-hint{position:absolute;bottom:24px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,.4);font-size:12px;pointer-events:none}',
    '</style></head><body>',
    '<header><h1>&#128062; <span>Claw Hunter</span> Free Image Gen</h1>',
    '<p>OpenAI Compatible API | 3 Free Models | Text-to-Image + Image-to-Image</p></header>',
    '<div class="wrap"><div class="grid">',
    '<div class="panel"><h2>&#9997;&#65039; Input</h2>',
    '<div class="field"><label>Prompt</label><textarea id="prompt" placeholder="Describe the image you want to generate..."></textarea></div>',
    '<div class="field"><label>Model <span class="badge">FREE</span></label><div class="model-grid" id="modelGrid"></div></div>',
    '<div class="field" id="imgSection" style="display:none"><label>Reference Image (Edit)</label>',
    '<div class="upload-zone" id="uploadZone">',
    '<input type="file" id="imageInput" accept="image/png,image/jpeg,image/webp">',
    '<div id="refPreview"><p>&#128247; Click or drag image here</p><p class="hint">PNG, JPEG, WebP | Max 10MB</p></div></div>',
    '<div class="ref-actions"><button class="ref-btn" id="removeBtn">Remove</button></div></div>',
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
    '<div class="preview" id="preview"><div class="placeholder">&#127912;<br>Enter prompt and click Generate</div></div>',
    '</div></div>',
    '<div class="api-info"><h3>&#128225; API Usage (Python)</h3>',
    '<pre><code>from openai import OpenAI\n\nclient = OpenAI(\n  base_url="https://YOUR-WORKER.workers.dev/v1",\n  api_key="your-key"\n)\n\n# Text-to-Image\nresp = client.images.generate(\n  model="gpt-image-2",\n  prompt="A cute cat", n=1\n)\n\n# Image-to-Image\nimport base64\nwith open("input.png", "rb") as f:\n  img_b64 = "data:image/png;base64," + base64.b64encode(f.read()).decode()\nresp = client.images.generate(\n  model="gpt-image-2",\n  prompt="Add sunglasses",\n  extra_body={"image": img_b64}\n)\nprint(resp.data[0].url)</code></pre></div></div>',
    '<div id="lightbox">',
    '<button class="lb-close">&times;</button>',
    '<img id="lbImg" src="" alt="Enlarged">',
    '<div class="lb-hint">Click outside or press ESC to close</div>',
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
    } catch (e) {
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
    try { body = await request.json(); } catch (e) { return errResp(400, "Invalid JSON body"); }

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

    // Support multiple image formats
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

    // Aggressive retry: 5 attempts, exponential backoff, pool refresh each time
    var MAX_ATTEMPTS = 5;
    for (var attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        // On retry: refresh entire token pool to get fresh tokens
        if (attempt > 0) {
          await refreshPool(5);
          var backoff = Math.min(2000 * Math.pow(2, attempt - 1), 15000);
          await new Promise(function(r) { setTimeout(r, backoff); });
        }

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
            if (retry > 0) {
              errMsg += " (retry in " + Math.ceil(retry / 60) + " min)";
              // Wait the full retry duration if reasonable
              if (retry <= 120) {
                await new Promise(function(r) { setTimeout(r, retry * 1000); });
                continue;
              }
            }
            // "daily free limit" means this token is exhausted
            if (errMsg.indexOf("limit") !== -1 || errMsg.indexOf("moderation") !== -1) {
              if (attempt < MAX_ATTEMPTS - 1) continue;
            }
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

        if (clawResp.status === 429 || clawResp.status === 503) {
          // Respect Retry-After header
          var retryAfter = clawResp.headers.get("Retry-After");
          if (retryAfter) {
            var waitSec = Math.min(parseInt(retryAfter, 10) || 5, 30);
            await new Promise(function(r) { setTimeout(r, waitSec * 1000); });
          }
          continue;
        }

        var errBody = await clawResp.json().catch(function() { return {}; });
        return errResp(clawResp.status, errBody.error || "Claw Hunter API error");

      } catch (e) {
        return errResp(500, "Internal error: " + e.message);
      }
    }

    return errResp(429, "Rate limited after " + MAX_ATTEMPTS + " retries. The free tier has daily limits per IP. Try again later or use a different network.");
  }

  return errResp(404, "Not found");
}

export default {
  fetch: async function(request, env, ctx) {
    try {
      return await handleRequest(request, env);
    } catch (e) {
      return errResp(500, "Worker error: " + e.message);
    }
  }
};
