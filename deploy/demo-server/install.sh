#!/usr/bin/env bash
# Install the Man portal demo on a fresh Linux server (Ubuntu/Debian/CentOS/AlmaLinux/Rocky).
# It only needs nginx: the demo is static files, so ~10 MB RAM is enough.
#
#   sudo bash install.sh                          → http://<server-ip>/
#   sudo bash install.sh demo.example.ir          → http://demo.example.ir/
#   sudo bash install.sh demo.example.ir me@x.ir  → also gets a free HTTPS certificate (Let's Encrypt)
#
# Running it again updates the files in place (safe to repeat).
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"
WEBROOT=/var/www/man-demo
say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

[ "$(id -u)" = 0 ] || { echo "Run as root: sudo bash install.sh"; exit 1; }
[ -f "$HERE/site/index.html" ] || { echo "site/ folder is missing next to install.sh"; exit 1; }

say "1/5 Installing nginx"
if command -v apt-get >/dev/null; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y -qq && apt-get install -y -qq nginx curl
  CONF=/etc/nginx/sites-available/man-demo
  LINK=/etc/nginx/sites-enabled/man-demo
  rm -f /etc/nginx/sites-enabled/default
elif command -v dnf >/dev/null || command -v yum >/dev/null; then
  PM=$(command -v dnf || command -v yum)
  $PM install -y -q epel-release >/dev/null 2>&1 || true
  $PM install -y -q nginx curl
  CONF=/etc/nginx/conf.d/man-demo.conf
  LINK=""
  # the stock nginx.conf on RHEL has its own default server on :80; drop default_server from ours then
else
  echo "Unsupported OS: install nginx manually and copy site/ to $WEBROOT"; exit 1
fi

if ss -ltnp 2>/dev/null | grep -q ':80 ' && ! ss -ltnp | grep ':80 ' | grep -q nginx; then
  echo "WARNING: another program (Apache?) is using port 80:"; ss -ltnp | grep ':80 '
  echo "Stop it first, e.g.: systemctl disable --now apache2 httpd"; exit 1
fi

say "2/5 Copying demo files to $WEBROOT"
mkdir -p "$WEBROOT"
cp -a "$HERE/site/." "$WEBROOT/"
chown -R root:root "$WEBROOT"
find "$WEBROOT" -type d -exec chmod 755 {} \; && find "$WEBROOT" -type f -exec chmod 644 {} \;
command -v restorecon >/dev/null && restorecon -R "$WEBROOT" || true   # SELinux

say "3/5 Writing nginx config"
SERVER_NAME="${DOMAIN:-_}"
DEFAULT=$([ -z "$DOMAIN" ] && [ -n "$LINK" ] && echo " default_server" || echo "")
LISTEN6=""
[ -s /proc/net/if_inet6 ] && LISTEN6="    listen [::]:80$DEFAULT;"   # only when the server has IPv6
sed -e "s|__SERVER_NAME__|$SERVER_NAME|" -e "s|__DEFAULT__|$DEFAULT|" -e "s|__ROOT__|$WEBROOT|" -e "s|__LISTEN6__|$LISTEN6|" "$HERE/nginx-demo.conf" > "$CONF"
[ -n "$LINK" ] && ln -sf "$CONF" "$LINK"
nginx -t
if command -v systemctl >/dev/null && systemctl enable --now nginx >/dev/null 2>&1; then
  systemctl reload nginx
else
  nginx -s reload 2>/dev/null || nginx   # no systemd (containers)
fi

say "4/5 Opening port 80/443 in the firewall (if one is active)"
if command -v ufw >/dev/null && ufw status | grep -q active; then ufw allow 80/tcp; ufw allow 443/tcp; fi
if command -v firewall-cmd >/dev/null && firewall-cmd --state >/dev/null 2>&1; then
  firewall-cmd --permanent --add-service=http --add-service=https && firewall-cmd --reload
fi

if [ -n "$DOMAIN" ] && [ -n "$EMAIL" ]; then
  say "5/5 HTTPS certificate for $DOMAIN"
  if command -v apt-get >/dev/null; then apt-get install -y -qq certbot python3-certbot-nginx; else $PM install -y -q certbot python3-certbot-nginx; fi
  certbot --nginx -d "$DOMAIN" -m "$EMAIL" --agree-tos --non-interactive --redirect || echo "certbot failed: check that $DOMAIN points to this server"
else
  say "5/5 HTTPS skipped (give a domain and email to enable it)"
fi

IP=$(curl -s --max-time 5 https://api.ipify.org || hostname -I | awk '{print $1}')
CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "Host: ${DOMAIN:-localhost}" http://127.0.0.1/ || true)
echo
if [ "$CODE" = 200 ]; then
  echo "✅ Demo is live:  http://${DOMAIN:-$IP}/"
else
  echo "⚠️  nginx answered $CODE locally; check: journalctl -u nginx --no-pager | tail"
fi
