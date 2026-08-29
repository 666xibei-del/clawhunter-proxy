/**
 * Claw Hunter Relay Worker
 * A minimal relay that forwards requests to clawhunter.fun
 * Deploy this on multiple CF accounts for IP rotation
 *
 * Deploy: npx wrangler deploy --name claw-relay-N
 * (use different --name for each account)
 */

var BASE = "https://clawhunter.fun";
var TOKEN_URL = BASE + "/api/v1/studio/token";
var IMAGE_URL = BASE + "/api/studio/images";

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

function jsonResp(data, code) {
  return new Response(JSON.stringify(data), {
    status: code || 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

export default {
  fetch: async function(request, env, ctx) {
    var url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Relay-Token"
      }});
    }

    // Health check
    if (url.pathname === "/health") {
      return jsonResp({ status: "ok", type: "relay", edge: "active" });
    }

    // Only handle image generation proxy requests
    if (url.pathname === "/relay" && request.method === "POST") {
      try {
        var body = await request.json();

        // Verify relay auth (simple shared secret)
        var auth = request.headers.get("X-Relay-Token");
        if (env.RELAY_SECRET && auth !== env.RELAY_SECRET) {
          return jsonResp({ error: "Unauthorized relay" }, 403);
        }

        var clawReq = body.request;
        if (!clawReq) {
          return jsonResp({ error: "Missing 'request' field" }, 400);
        }

        // Get a fresh token and forward to upstream
        var tok = await getToken();
        var clawResp = await fetch(IMAGE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-studio-token": tok },
          body: JSON.stringify(clawReq)
        });

        var clawData = await clawResp.json().catch(function() { return {}; });

        return new Response(JSON.stringify(clawData), {
          status: clawResp.status,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });

      } catch(e) {
        return jsonResp({ error: "Relay error: " + e.message }, 500);
      }
    }

    return jsonResp({ error: "Not found", usage: "POST /relay" }, 404);
  }
};
