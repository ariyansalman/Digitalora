#!/bin/sh
set -eu

if [ -z "${WG_CONFIG_B64:-}" ]; then
  echo "WG_CONFIG_B64 is required. Paste the base64 WireGuard config into Railway variables." >&2
  exit 1
fi

PORT="${PORT:-8888}"
mkdir -p /etc/wireproxy
printf '%s' "$WG_CONFIG_B64" | base64 -d > /etc/wireproxy/wg.conf

cp /etc/wireproxy/wg.conf /etc/wireproxy/wireproxy.conf
cat >> /etc/wireproxy/wireproxy.conf <<EOF

[http]
BindAddress = [::]:${PORT}
EOF

echo "Starting WireGuard-backed HTTP proxy on [::]:${PORT}"
exec wireproxy -c /etc/wireproxy/wireproxy.conf -i [::]:9080
