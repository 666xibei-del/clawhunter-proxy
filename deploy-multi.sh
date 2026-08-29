#!/bin/bash
# ============================================================
# Claw Hunter Multi-Node Deploy Script
# Deploy relay Workers across multiple CF accounts for IP rotation
# ============================================================
#
# Usage:
#   ./deploy-multi.sh setup    - Create relay Workers on all accounts
#   ./deploy-multi.sh deploy   - Deploy all relays + main Worker
#   ./deploy-multi.sh status   - Check all relay health
#   ./deploy-multi.sh add      - Add a new CF account
#   ./deploy-multi.sh list     - List all configured accounts
#   ./deploy-multi.sh update-main - Update main Worker RELAY_URLS
#
# ============================================================

CONFIG_FILE=".relay-accounts.json"
RELAY_NAME_PREFIX="claw-relay"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_ok() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_err() { echo -e "${RED}[ERROR]${NC} $1"; }

# Initialize config if not exists
init_config() {
  if [ ! -f "$CONFIG_FILE" ]; then
    echo '{"accounts":[],"main_worker":"clawhunter-proxy"}' > "$CONFIG_FILE"
    log_info "Created $CONFIG_FILE"
  fi
}

# Add a new CF account
cmd_add() {
  init_config
  echo ""
  echo "========================================="
  echo " Add Cloudflare Account for Relay Node"
  echo "========================================="
  echo ""
  echo "Steps to get your CF API credentials:"
  echo "  1. Go to https://dash.cloudflare.com/profile/api-tokens"
  echo "  2. Create a token with 'Cloudflare Workers' edit permission"
  echo "  3. Note your Account ID from the dashboard"
  echo ""

  read -p "Account Name (e.g. personal, team1): " ACCT_NAME
  read -p "Account ID: " ACCT_ID
  read -p "API Token: " ACCT_TOKEN
  read -p "Custom domain (optional, press Enter to skip): " CUSTOM_DOMAIN

  # Generate a relay secret if not exists
  RELAY_SECRET=$(openssl rand -hex 16 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(16))")

  # Add to config using node
  node -e "
    var fs = require('fs');
    var cfg = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));
    cfg.accounts.push({
      name: '$ACCT_NAME',
      accountId: '$ACCT_ID',
      apiToken: '$ACCT_TOKEN',
      domain: '$CUSTOM_DOMAIN',
      relaySecret: '$RELAY_SECRET',
      deployed: false,
      url: ''
    });
    fs.writeFileSync('$CONFIG_FILE', JSON.stringify(cfg, null, 2));
    console.log('Account added: $ACCT_NAME');
  "

  log_ok "Account '$ACCT_NAME' added! Run './deploy-multi.sh setup' to deploy relay."
}

# List all accounts
cmd_list() {
  init_config
  echo ""
  echo "========================================="
  echo " Configured CF Accounts"
  echo "========================================="
  echo ""

  node -e "
    var cfg = JSON.parse(require('fs').readFileSync('$CONFIG_FILE', 'utf8'));
    if (cfg.accounts.length === 0) {
      console.log('  No accounts configured. Run: ./deploy-multi.sh add');
    } else {
      cfg.accounts.forEach(function(a, i) {
        var status = a.deployed ? '✅ Deployed' : '⏳ Not deployed';
        var url = a.url || '(not yet)';
        console.log('  [' + (i+1) + '] ' + a.name);
        console.log('      Account ID: ' + a.accountId.substring(0, 8) + '...');
        console.log('      Status: ' + status);
        console.log('      URL: ' + url);
        console.log('');
      });
    }
    console.log('Total relay nodes: ' + cfg.accounts.length);
    console.log('Main Worker: ' + (cfg.main_worker || 'clawhunter-proxy'));
  "
}

# Deploy relay to all accounts
cmd_setup() {
  init_config
  log_info "Deploying relay Workers to all accounts..."

  node -e "
    var fs = require('fs');
    var { execSync } = require('child_process');
    var cfg = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));

    if (cfg.accounts.length === 0) {
      console.log('No accounts configured. Run: ./deploy-multi.sh add');
      process.exit(1);
    }

    var relayUrls = [];

    cfg.accounts.forEach(function(acct, i) {
      var relayName = '$RELAY_NAME_PREFIX-' + (i + 1);
      console.log('');
      console.log('=== Deploying relay: ' + relayName + ' (account: ' + acct.name + ') ===');

      // Create temp wrangler.toml for this relay
      var toml = '';
      toml += 'name = \"' + relayName + '\"\\n';
      toml += 'main = \"relay.js\"\\n';
      toml += 'compatibility_date = \"2024-12-01\"\\n';
      toml += 'compatibility_flags = [\"nodejs_compat\"]\\n';
      toml += '';
      toml += '[vars]\\n';
      toml += 'RELAY_SECRET = \"' + acct.relaySecret + '\"\\n';
      if (acct.domain) {
        toml += '';
        toml += '[[routes]]\\n';
        toml += 'pattern = \"' + acct.domain + '/relay\"\\n';
      }

      fs.writeFileSync('wrangler-relay.toml', toml);

      try {
        // Deploy using CF API credentials
        var env = Object.assign({}, process.env, {
          CLOUDFLARE_ACCOUNT_ID: acct.accountId,
          CLOUDFLARE_API_TOKEN: acct.apiToken
        });

        execSync('npx wrangler deploy --config wrangler-relay.toml', {
          env: env,
          stdio: 'inherit',
          timeout: 60000
        });

        // Get the deployed URL
        var url = 'https://' + relayName + '.workers.dev';
        acct.deployed = true;
        acct.url = url;
        relayUrls.push(url);
        console.log('✅ Deployed: ' + url);

      } catch(e) {
        console.log('❌ Failed to deploy ' + acct.name + ': ' + e.message);
        acct.deployed = false;
      }
    });

    // Save updated config
    fs.writeFileSync('$CONFIG_FILE', JSON.stringify(cfg, null, 2));

    // Clean up temp wrangler.toml
    try { fs.unlinkSync('wrangler-relay.toml'); } catch(e) {}

    // Print summary
    console.log('');
    console.log('=========================================');
    console.log(' Deployment Summary');
    console.log('=========================================');
    console.log('');

    var deployed = cfg.accounts.filter(function(a) { return a.deployed; });
    console.log('Deployed: ' + deployed.length + '/' + cfg.accounts.length);

    if (relayUrls.length > 0) {
      console.log('');
      console.log('Relay URLs (set as RELAY_URLS on main Worker):');
      console.log('RELAY_URLS=\"' + relayUrls.join(',') + '\"');
      console.log('');
      console.log('RELAY_SECRET=\"' + cfg.accounts[0].relaySecret + '\"');
      console.log('');
      console.log('Deploy main worker with:');
      console.log('  npx wrangler secret put RELAY_URLS');
      console.log('  npx wrangler secret put RELAY_SECRET');
      console.log('  npx wrangler deploy');
    }
  "
}

# Check status of all relays
cmd_status() {
  init_config
  log_info "Checking relay health..."

  node -e "
    var fs = require('fs');
    var cfg = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));
    var https = require('https');

    function checkUrl(url) {
      return new Promise(function(resolve) {
        https.get(url + '/health', { timeout: 5000 }, function(res) {
          var data = '';
          res.on('data', function(c) { data += c; });
          res.on('end', function() {
            try {
              resolve({ url: url, status: 'ok', data: JSON.parse(data) });
            } catch(e) {
              resolve({ url: url, status: 'error', error: 'Invalid JSON' });
            }
          });
        }).on('error', function(e) {
          resolve({ url: url, status: 'error', error: e.message });
        }).on('timeout', function() {
          resolve({ url: url, status: 'timeout' });
        });
      });
    }

    var checks = cfg.accounts.filter(function(a) { return a.deployed && a.url; }).map(function(a) {
      return checkUrl(a.url).then(function(r) {
        console.log((r.status === 'ok' ? '✅' : '❌') + ' ' + r.url + ' - ' + (r.status === 'ok' ? 'healthy' : r.error || r.status));
        return r;
      });
    });

    Promise.all(checks).then(function(results) {
      var healthy = results.filter(function(r) { return r.status === 'ok'; });
      console.log('');
      console.log('Healthy relays: ' + healthy.length + '/' + results.length);
    });
  "
}

# Update main Worker with relay URLs
cmd_update-main() {
  init_config
  log_info "Updating main Worker configuration..."

  node -e "
    var fs = require('fs');
    var cfg = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));
    var deployed = cfg.accounts.filter(function(a) { return a.deployed && a.url; });

    if (deployed.length === 0) {
      console.log('No deployed relays found. Run: ./deploy-multi.sh setup');
      process.exit(1);
    }

    var urls = deployed.map(function(a) { return a.url; });
    var secret = deployed[0].relaySecret;

    console.log('');
    console.log('Relay URLs (' + urls.length + ' nodes):');
    urls.forEach(function(u, i) { console.log('  [' + (i+1) + '] ' + u); });
    console.log('');
    console.log('Set these secrets on your main Worker:');
    console.log('');
    console.log('  echo \"' + urls.join(',') + '\" | npx wrangler secret put RELAY_URLS');
    console.log('  echo \"' + secret + '\" | npx wrangler secret put RELAY_SECRET');
    console.log('');
    console.log('Then deploy:');
    console.log('  npx wrangler deploy');
  "
}

# Show usage
cmd_usage() {
  echo ""
  echo "========================================="
  echo " Claw Hunter Multi-Node IP Rotation"
  echo "========================================="
  echo ""
  echo "CF Workers run on 200+ edge nodes globally."
  echo "Each CF account gets a different edge node IP."
  echo "Deploy relay Workers on multiple accounts for IP rotation."
  echo ""
  echo "Architecture:"
  echo ""
  echo "  User → Main Worker (CF Edge A)"
  echo "              ↓ direct (if OK)"
  echo "          clawhunter.fun"
  echo ""
  echo "  User → Main Worker (CF Edge A)"
  echo "              ↓ daily limit hit!"
  echo "          Relay 1 (CF Edge B) → clawhunter.fun"
  echo "          Relay 2 (CF Edge C) → clawhunter.fun"
  echo "          Relay 3 (CF Edge D) → clawhunter.fun"
  echo ""
  echo "Each relay = different CF account = different IP = independent quota!"
  echo ""
  echo "Commands:"
  echo "  ./deploy-multi.sh add          - Add a new CF account"
  echo "  ./deploy-multi.sh list         - List all configured accounts"
  echo "  ./deploy-multi.sh setup        - Deploy relays to all accounts"
  echo "  ./deploy-multi.sh deploy       - Deploy everything"
  echo "  ./deploy-multi.sh status       - Check relay health"
  echo "  ./deploy-multi.sh update-main  - Update main Worker config"
  echo ""
}

# Main dispatch
case "${1:-help}" in
  add)         cmd_add ;;
  list)        cmd_list ;;
  setup)       cmd_setup ;;
  deploy)      cmd_setup; cmd_update-main ;;
  status)      cmd_status ;;
  update-main) cmd_update-main ;;
  help|*)      cmd_usage ;;
esac
