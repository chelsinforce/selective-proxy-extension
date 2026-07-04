// =====================================================================
// Selective Domain Proxy - service worker (Manifest V3, Chrome 108+)
//
//  1. chrome.proxy in "pac_script" mode: only the target domains
//     (+ a diagnostic endpoint) go through the proxy, everything else
//     stays DIRECT.
//  2. chrome.webRequest.onAuthRequired (asyncBlocking + the
//     webRequestAuthProvider permission): proxy credentials are read
//     from storage AT the 407 challenge, which makes it robust to
//     MV3 service worker suspension. This is the piece that generic
//     proxy switchers miss and that causes ERR_TUNNEL_CONNECTION_FAILED
//     on HTTPS CONNECT tunnels.
//  3. Failsafe: on repeated tunnel failures, routing is disabled
//     automatically, the user is notified, browsing falls back to
//     DIRECT instead of being blocked.
// =====================================================================

const DEFAULTS = {
  proxyHost: "",
  proxyPort: 8080,
  username: "",
  password: "",
  domains: ["example.com"],
  suspended: false
};

// Generic diagnostic endpoint, always routed through the proxy so the
// "Test connection" feature reports the actual exit IP.
const DIAG_DOMAIN = "ipinfo.io";
const DIAG_URL = "https://ipinfo.io/json";

async function getConfig() {
  return await chrome.storage.local.get(DEFAULTS);
}

async function applyFromStorage() {
  const cfg = await getConfig();
  if (!cfg.proxyHost || !cfg.username || !cfg.password || cfg.suspended) {
    await chrome.proxy.settings.clear({ scope: "regular" });
    return;
  }
  await chrome.proxy.settings.set({
    value: { mode: "pac_script", pacScript: { data: buildPacScript(cfg) } },
    scope: "regular"
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  const keys = Object.keys(changes);
  if (keys.some(k => ["proxyHost", "proxyPort", "username", "password", "domains", "suspended"].includes(k))) {
    applyFromStorage();
  }
});

chrome.runtime.onInstalled.addListener(applyFromStorage);
chrome.runtime.onStartup.addListener(applyFromStorage);
applyFromStorage();

// --- PAC ---------------------------------------------------------------

function buildPacScript(cfg) {
  const proxy = `PROXY ${cfg.proxyHost}:${cfg.proxyPort}`;
  const domains = [...new Set([...(cfg.domains || []), DIAG_DOMAIN])]
    .map(d => String(d).trim().toLowerCase())
    .filter(Boolean);
  const conditions = domains
    .map(d => `(host === "${d}" || dnsDomainIs(host, ".${d}"))`)
    .join(" || ");
  return `function FindProxyForURL(url, host) {
  host = host.toLowerCase();
  if (${conditions || "false"}) {
    return "${proxy}";
  }
  return "DIRECT";
}`;
}

// --- Credential injection (proxy 407 challenge) ------------------------

const pendingAuthRequests = new Set();

chrome.webRequest.onAuthRequired.addListener(
  (details, asyncCallback) => {
    // Only answer proxy challenges (407), never website 401s, so proxy
    // credentials are never disclosed to a third-party site.
    if (!details.isProxy) { asyncCallback({}); return; }
    if (pendingAuthRequests.has(details.requestId)) {
      // Second challenge on the same request means the credentials were
      // rejected: stop instead of looping.
      pendingAuthRequests.delete(details.requestId);
      asyncCallback({ cancel: true });
      return;
    }
    pendingAuthRequests.add(details.requestId);
    // Read straight from storage: the service worker may have been woken
    // by this very challenge, so in-memory state is not reliable here.
    chrome.storage.local
      .get({ username: "", password: "" })
      .then(creds => {
        if (!creds.username || !creds.password) { asyncCallback({ cancel: true }); return; }
        asyncCallback({ authCredentials: { username: creds.username, password: creds.password } });
      })
      .catch(() => asyncCallback({ cancel: true }));
  },
  { urls: ["<all_urls>"] },
  ["asyncBlocking"]
);

function clearPending(details) { pendingAuthRequests.delete(details.requestId); }
chrome.webRequest.onCompleted.addListener(clearPending, { urls: ["<all_urls>"] });

// --- Failsafe: auto-disable on repeated tunnel failures ----------------

const FAIL_WINDOW_MS = 30000;
const FAIL_THRESHOLD = 2;
let failTimestamps = [];

async function isTargetHost(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const cfg = await getConfig();
    const domains = [...(cfg.domains || []), DIAG_DOMAIN].map(d => d.toLowerCase());
    return domains.some(d => host === d || host.endsWith("." + d));
  } catch { return false; }
}

chrome.webRequest.onErrorOccurred.addListener(async details => {
  clearPending(details);
  if (details.error !== "net::ERR_TUNNEL_CONNECTION_FAILED") return;
  if (!(await isTargetHost(details.url))) return;
  const now = Date.now();
  failTimestamps = failTimestamps.filter(t => now - t < FAIL_WINDOW_MS);
  failTimestamps.push(now);
  const cfg = await getConfig();
  if (failTimestamps.length >= FAIL_THRESHOLD && !cfg.suspended) {
    failTimestamps = [];
    await chrome.storage.local.set({ suspended: true });
    chrome.notifications.create("proxy-suspended", {
      type: "basic",
      iconUrl: "icon128.png",
      title: "Selective Domain Proxy: routing suspended",
      message: "The proxy refused the connection (credentials or host). Browsing continues directly. Open the extension to fix and re-enable.",
      priority: 2
    });
  }
}, { urls: ["<all_urls>"] });

// --- Connection test (used by options and popup) -----------------------

async function testConnection() {
  const cfg = await getConfig();
  if (!cfg.proxyHost || !cfg.username || !cfg.password) {
    return { ok: false, error: "Proxy host and credentials are required." };
  }
  await chrome.proxy.settings.set({
    value: { mode: "pac_script", pacScript: { data: buildPacScript(cfg) } },
    scope: "regular"
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(DIAG_URL, { cache: "no-store", credentials: "omit", signal: controller.signal });
    if (!resp.ok) return { ok: false, error: `Unexpected diagnostic response (HTTP ${resp.status}).` };
    const data = await resp.json();
    return { ok: true, ip: data.ip || "unknown", org: data.org || "", city: data.city || "" };
  } catch (e) {
    const aborted = e && e.name === "AbortError";
    return {
      ok: false,
      error: aborted
        ? "Timeout: proxy unreachable or credentials rejected."
        : "Connection refused by the proxy: check host, port and credentials."
    };
  } finally {
    clearTimeout(timer);
    const after = await getConfig();
    if (after.suspended) await applyFromStorage();
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "test-connection") {
    testConnection().then(async result => {
      if (result.ok) {
        await chrome.storage.local.set({ suspended: false });
        failTimestamps = [];
      } else {
        await applyFromStorage();
      }
      sendResponse(result);
    });
    return true;
  }
  if (msg && msg.type === "get-status") {
    getConfig().then(cfg => {
      sendResponse({
        configured: Boolean(cfg.proxyHost && cfg.username && cfg.password),
        suspended: Boolean(cfg.suspended),
        proxyHost: cfg.proxyHost || "",
        proxyPort: cfg.proxyPort,
        domains: cfg.domains || []
      });
    });
    return true;
  }
});
