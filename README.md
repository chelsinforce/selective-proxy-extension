# Selective Domain Proxy

A Chrome extension (Manifest V3, Chrome 108+) that routes **only specific
domains** through an authenticated HTTP proxy, with transparent proxy
authentication (no popup, no `ERR_TUNNEL_CONNECTION_FAILED`). All other traffic
uses the browser's direct connection.

Typical use cases: force a specific exit IP on a single domain (geo-restricted
access, controlled outbound IP, multi-region testing) without routing the whole
machine through a proxy.

## Why this extension

Generic proxy switchers (ZeroOmega, FoxyProxy) often fail to pass proxy
authentication on HTTPS CONNECT tunnels under Manifest V3. Chrome requires the
`webRequestAuthProvider` permission combined with a
`chrome.webRequest.onAuthRequired` listener in `asyncBlocking` mode to answer the
proxy's 407 challenge. This extension implements exactly that, and only answers
proxy challenges (`details.isProxy`), never website 401s, so proxy credentials
are never exposed to a third-party site.

## Features

- Per-domain routing via a dynamic PAC script (target domains to the proxy,
  everything else DIRECT).
- Transparent proxy authentication, robust to MV3 service worker suspension
  (credentials are read from storage at the auth challenge).
- Options page and status popup with a built-in connection test that shows the
  live exit IP.
- Failsafe: routing is disabled automatically after repeated tunnel failures,
  with a notification; browsing continues directly instead of being blocked.

## Install (developer mode)

1. Download or clone this repository.
2. Open `chrome://extensions`, enable "Developer mode".
3. Click "Load unpacked" and select the extension folder.
4. Right-click the extension icon > Options. Fill in proxy host, port,
   credentials and target domains. Save and test.

## Configuration

| Field         | Example             | Purpose                              |
|---------------|---------------------|--------------------------------------|
| Proxy host    | proxy.example.com   | Proxy hostname                       |
| Port          | 8080                | Proxy port                           |
| Username      | user                | Proxy auth username                  |
| Password      | ******              | Proxy auth password                  |
| Target domains| example.com         | One per line, subdomains included    |

The connection test routes `ipinfo.io` through the proxy to report the actual
exit IP. Since any target domain and the diagnostic endpoint share the same
proxy in the PAC, the reported IP is the one target sites see.

## Deployment at scale

- Chrome Web Store, unlisted visibility (one-click install, no developer mode).
- Force-install via an admin console (Google Workspace, Intune, GPO) using
  `ExtensionInstallForcelist`.

## Known limitations

- Chrome and Chromium browsers (Edge, Brave) with the same package.
- Only one extension can control `chrome.proxy` at a time: disable other proxy
  extensions before enabling this one.
- HTTP proxies do not cover WebRTC. If you strictly need to prevent real-IP
  exposure, constrain WebRTC at the browser level
  (`webRTCIPHandlingPolicy = disable_non_proxied_udp`).

## License

MIT. See the LICENSE file.
