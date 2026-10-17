#!/usr/bin/env bash
# Regenerates cloudflare-real-ip.inc from Cloudflare's official lists
# (https://www.cloudflare.com/ips/) and reloads Nginx if it is running.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
out="$here/conf.d/cloudflare-real-ip.inc"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

{
  echo "# Generated $(date -u +%Y-%m-%dT%H:%M:%SZ) by update-cloudflare-ips.sh — do not edit."
  for list in ips-v4 ips-v6; do
    curl -fsS "https://www.cloudflare.com/$list" | while read -r cidr; do
      [[ -n "$cidr" ]] && echo "set_real_ip_from $cidr;"
    done
  done
  echo "real_ip_header CF-Connecting-IP;"
} > "$tmp"

if ! grep -q "set_real_ip_from" "$tmp"; then
  echo "Refusing to write an empty range list" >&2
  exit 1
fi

mv "$tmp" "$out"
trap - EXIT
echo "Wrote $out"

if docker compose ps nginx --status running >/dev/null 2>&1; then
  docker compose exec nginx nginx -t && docker compose exec nginx nginx -s reload
fi
