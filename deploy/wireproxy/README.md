# Binance Pay WireProxy Sidecar

This Railway service converts a WireGuard config into an internal HTTP proxy for Binance Pay verification.

It uses `wireproxy`, a userspace WireGuard client, so Railway does not need privileged WireGuard access.

## Railway Variables

Set these on the sidecar service:

```env
WG_CONFIG_B64=your_base64_wireguard_config
PORT=8888
```

Set this on the bot service:

```env
BINANCE_PROXY_URL=http://vpn-sidecar.railway.internal:8888
BINANCE_API_BASE_URLS=
```

Name the Railway sidecar service `vpn-sidecar` so the private hostname is `vpn-sidecar.railway.internal`.
