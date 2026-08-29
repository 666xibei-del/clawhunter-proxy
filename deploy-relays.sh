#!/bin/bash
# ============================================================
# Free Platform Relay Deploy Script
# Deploy relay Workers to free platforms for IP rotation
# ============================================================
#
# Platforms (all free, no credit card):
#   - Vercel Edge Functions (100GB/month)
#   - Deno Deploy (100GB/month)
#   - Netlify Edge Functions (125K requests/month)
#   - GitHub Pages + Actions (unlimited)
#   - Cloudflare Workers (free tier, different accounts)
#
# Usage:
#   ./deploy-relays.sh vercel    - Deploy to Vercel
#   ./deploy-relays.sh deno      - Deploy to Deno Deploy
#   ./deploy-relays.sh netlify   - Deploy to Netlify
#   ./deploy-relays.sh all       - Deploy to all platforms
#   ./deploy-relays.sh status    - Check all relay health
#   ./deploy-relays.sh config    - Show RELAY_URLS config
#
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_ok() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_err() { echo -e "${RED}[ERROR]${NC} $1"; }

# ============================================================
# Vercel Deployment
# ============================================================
deploy_vercel() {
  log_info "Deploying to Vercel Edge Functions..."

  # Check if vercel CLI is installed
  if ! command -v vercel &> /dev/null; then
    log_warn "Vercel CLI not found. Installing..."
    npm i -g vercel 2>/dev/null || {
      log_err "Failed to install vercel. Run: npm i -g vercel"
      return 1
    }
  fi

  # Check if logged in
  if ! vercel whoami &> /dev/null; then
    log_warn "Not logged in to Vercel. Run: vercel login"
    return 1
  fi

  cd relays/vercel

  # Deploy
  local OUTPUT
  OUTPUT=$(vercel deploy --prod --yes 2>&1)
  local URL=$(echo "$OUTPUT" | grep -oP 'https://[^\s]+\.vercel\.app' | head -1)

  cd ../..

  if [ -n "$URL" ]; then
    log_ok "Vercel deployed: $URL"
    echo "$URL" > .relay-url-vercel
    return 0
  else
    log_err "Vercel deployment failed"
    echo "$OUTPUT"
    return 1
  fi
}

# ============================================================
# Deno Deploy
# ============================================================
deploy_deno() {
  log_info "Deploying to Deno Deploy..."

  # Check if deployctl is installed
  if ! command -v deployctl &> /dev/null; then
    log_warn "deployctl not found. Installing..."
    deno install -Arf https://deno.land/x/deployctl/deployctl.ts 2>/dev/null || {
      log_err "Failed to install deployctl. Run: deno install -Arf https://deno.land/x/deployctl/deployctl.ts"
      return 1
    }
  fi

  # Check if logged in
  if ! deployctl whoami &> /dev/null; then
    log_warn "Not logged in to Deno Deploy. Run: deployctl login"
    return 1
  fi

  cd relays/deno

  # Deploy
  local OUTPUT
  OUTPUT=$(deployctl deploy --project=claw-relay --prod deploy.ts 2>&1)
  local URL=$(echo "$OUTPUT" | grep -oP 'https://[^\s]+\.deno\.dev' | head -1)

  cd ../..

  if [ -n "$URL" ]; then
    log_ok "Deno Deploy: $URL"
    echo "$URL" > .relay-url-deno
    return 0
  else
    log_err "Deno deployment failed"
    echo "$OUTPUT"
    return 1
  fi
}

# ============================================================
# Netlify Deployment
# ============================================================
deploy_netlify() {
  log_info "Deploying to Netlify Edge Functions..."

  # Check if netlify CLI is installed
  if ! command -v netlify &> /dev/null; then
    log_warn "Netlify CLI not found. Installing..."
    npm i -g netlify-cli 2>/dev/null || {
      log_err "Failed to install netlify-cli. Run: npm i -g netlify-cli"
      return 1
    }
  fi

  # Check if logged in
  if ! netlify status &> /dev/null; then
    log_warn "Not logged in to Netlify. Run: netlify login"
    return 1
  fi

  cd relays/netlify

  # Create netlify.toml if not exists
  if [ ! -f "netlify.toml" ]; then
    cat > netlify.toml << 'EOF'
[build]
  publish = "."

[[edge_functions]]
  path = "/relay"
  function = "relay"
EOF
  fi

  # Deploy
  local OUTPUT
  OUTPUT=$(netlify deploy --prod --dir=. 2>&1)
  local URL=$(echo "$OUTPUT" | grep -oP 'https://[^\s]+\.netlify\.app' | head -1)

  cd ../..

  if [ -n "$URL" ]; then
    log_ok "Netlify deployed: $URL"
    echo "$URL" > .relay-url-netlify
    return 0
  else
    log_err "Netlify deployment failed"
    echo "$OUTPUT"
    return 1
  fi
}

# ============================================================
# Check all relay health
# ============================================================
cmd_status() {
  log_info "Checking relay health..."

  local TOTAL=0
  local OK=0

  for platform in vercel deno netlify; do
    local FILE=".relay-url-$platform"
    if [ -f "$FILE" ]; then
      local URL=$(cat "$FILE")
      TOTAL=$((TOTAL + 1))

      # Check health endpoint
      local HEALTH
      HEALTH=$(curl -sS --max-time 5 "$URL" 2>/dev/null)
      if echo "$HEALTH" | grep -q '"status":"ok"'; then
        log_ok "$platform: $URL"
        OK=$((OK + 1))
      else
        log_err "$platform: $URL (unhealthy)"
      fi
    fi
  done

  # Check CF relay Workers
  if [ -f ".relay-accounts.json" ]; then
    node -e "
      var cfg = JSON.parse(require('fs').readFileSync('.relay-accounts.json', 'utf8'));
      cfg.accounts.forEach(function(a) {
        if (a.deployed && a.url) {
          var https = require('https');
          https.get(a.url + '/health', { timeout: 5000 }, function(res) {
            var d = '';
            res.on('data', function(c) { d += c; });
            res.on('end', function() {
              try {
                var j = JSON.parse(d);
                console.log('✅ CF Relay (' + a.name + '): ' + a.url);
              } catch(e) {
                console.log('❌ CF Relay (' + a.name + '): unhealthy');
              }
            });
          }).on('error', function() {
            console.log('❌ CF Relay (' + a.name + '): ' + a.url + ' (unreachable)');
          });
        }
      });
    " 2>/dev/null
  fi

  echo ""
  echo "Health: $OK/$TOTAL platform relays OK"
}

# ============================================================
# Show config
# ============================================================
cmd_config() {
  log_info "Generating RELAY_URLS configuration..."

  local URLS=""

  for platform in vercel deno netlify; do
    local FILE=".relay-url-$platform"
    if [ -f "$FILE" ]; then
      local URL=$(cat "$FILE")
      if [ -n "$URLS" ]; then
        URLS="$URLS,$URL/relay"
      else
        URLS="$URL/relay"
      fi
    fi
  done

  # Add CF relay Workers
  if [ -f ".relay-accounts.json" ]; then
    local CF_URLS
    CF_URLS=$(node -e "
      var cfg = JSON.parse(require('fs').readFileSync('.relay-accounts.json', 'utf8'));
      cfg.accounts.filter(function(a) { return a.deployed && a.url; }).forEach(function(a) {
        process.stdout.write(a.url + '/relay,');
      });
    " 2>/dev/null | sed 's/,$//')

    if [ -n "$CF_URLS" ]; then
      if [ -n "$URLS" ]; then
        URLS="$URLS,$CF_URLS"
      else
        URLS="$CF_URLS"
      fi
    fi
  fi

  if [ -n "$URLS" ]; then
    echo ""
    echo "========================================="
    echo " RELAY_URLS Configuration"
    echo "========================================="
    echo ""
    echo "$URLS"
    echo ""
    echo "Set on main Worker:"
    echo "  echo \"$URLS\" | npx wrangler secret put RELAY_URLS"
    echo ""
    echo "Then deploy:"
    echo "  npx wrangler deploy"
  else
    log_warn "No relays deployed yet. Run:"
    echo "  ./deploy-relays.sh vercel"
    echo "  ./deploy-relays.sh deno"
    echo "  ./deploy-relays.sh netlify"
    echo "  ./deploy-relays.sh all"
  fi
}

# ============================================================
# Deploy all
# ============================================================
cmd_all() {
  local URLS=""

  echo ""
  echo "========================================="
  echo " Deploying Relays to All Free Platforms"
  echo "========================================="
  echo ""

  # Deploy to each platform
  deploy_vercel && {
    URL=$(cat .relay-url-vercel 2>/dev/null)
    URLS="${URLS}${URL}/relay,"
  }

  deploy_deno && {
    URL=$(cat .relay-url-deno 2>/dev/null)
    URLS="${URLS}${URL}/relay,"
  }

  deploy_netlify && {
    URL=$(cat .relay-url-netlify 2>/dev/null)
    URLS="${URLS}${URL}/relay,"
  }

  # Deploy CF relay Workers
  if [ -f ".relay-accounts.json" ]; then
    log_info "Deploying CF relay Workers..."
    ./deploy-multi.sh setup 2>/dev/null
  fi

  # Show final config
  echo ""
  cmd_config
}

# ============================================================
# Help
# ============================================================
cmd_help() {
  echo ""
  echo "========================================="
  echo " Free Platform Relay Deploy"
  echo "========================================="
  echo ""
  echo "Free platforms for IP rotation (no credit card):"
  echo ""
  echo "  Platform          Free Tier              IP Pool"
  echo "  ─────────────────────────────────────────────"
  echo "  Vercel Edge       100GB/month            30+ edge locations"
  echo "  Deno Deploy       100GB/month            35+ regions"
  echo "  Netlify Edge      125K req/month         10+ edge locations"
  echo "  CF Workers        100K req/day           200+ edge locations"
  echo ""
  echo "Each platform = different IP range = independent quota!"
  echo ""
  echo "Commands:"
  echo "  ./deploy-relays.sh vercel    - Deploy to Vercel"
  echo "  ./deploy-relays.sh deno      - Deploy to Deno Deploy"
  echo "  ./deploy-relays.sh netlify   - Deploy to Netlify"
  echo "  ./deploy-relays.sh all       - Deploy to all platforms"
  echo "  ./deploy-relays.sh status    - Check relay health"
  echo "  ./deploy-relays.sh config    - Show RELAY_URLS config"
  echo ""
  echo "Quick start:"
  echo "  ./deploy-relays.sh all       # Deploy everything"
  echo "  ./deploy-relays.sh config    # Get config to set on main Worker"
  echo ""
}

# Main dispatch
case "${1:-help}" in
  vercel)    deploy_vercel ;;
  deno)      deploy_deno ;;
  netlify)   deploy_netlify ;;
  all)       cmd_all ;;
  status)    cmd_status ;;
  config)    cmd_config ;;
  help|*)    cmd_help ;;
esac
