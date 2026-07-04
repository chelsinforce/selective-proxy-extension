const DEFAULTS = {
  proxyHost: "",
  proxyPort: 8080,
  username: "",
  password: "",
  domains: ["example.com"]
};
const $ = id => document.getElementById(id);

async function restore() {
  const cfg = await chrome.storage.local.get(DEFAULTS);
  $("proxyHost").value = cfg.proxyHost;
  $("proxyPort").value = cfg.proxyPort;
  $("username").value = cfg.username;
  $("password").value = cfg.password;
  $("domains").value = (cfg.domains || []).join("\n");
}

async function saveAndTest() {
  const btn = $("save"), status = $("status");
  btn.disabled = true; status.className = ""; status.textContent = "Saving...";
  const domains = $("domains").value
    .split("\n")
    .map(d => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
    .filter(Boolean);
  await chrome.storage.local.set({
    proxyHost: $("proxyHost").value.trim(),
    proxyPort: parseInt($("proxyPort").value, 10) || DEFAULTS.proxyPort,
    username: $("username").value.trim(),
    password: $("password").value,
    domains: domains.length ? domains : DEFAULTS.domains
  });
  status.textContent = "Testing proxy connection...";
  const r = await chrome.runtime.sendMessage({ type: "test-connection" });
  if (r.ok) {
    status.className = "ok";
    const loc = [r.city, r.org].filter(Boolean).join(", ");
    status.textContent = `Configuration valid. Exit IP: ${r.ip}${loc ? " (" + loc + ")" : ""}`;
  } else {
    status.className = "ko";
    status.textContent = `Failed: ${r.error || "test rejected."}`;
  }
  btn.disabled = false;
}

document.addEventListener("DOMContentLoaded", restore);
$("save").addEventListener("click", saveAndTest);
