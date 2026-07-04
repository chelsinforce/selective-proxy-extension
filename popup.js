const $ = id => document.getElementById(id);

async function refreshStatus() {
  const st = await chrome.runtime.sendMessage({ type: "get-status" });
  $("host").textContent = st.proxyHost ? `${st.proxyHost}:${st.proxyPort}` : "-";
  $("domains").textContent = (st.domains || []).join(", ") || "-";
  const dot = $("dot"); dot.className = "dot";
  if (!st.configured) {
    dot.classList.add("off"); $("statusText").textContent = "Not configured"; $("test").disabled = true;
  } else if (st.suspended) {
    dot.classList.add("ko"); $("statusText").textContent = "Routing suspended (proxy error)";
    $("test").textContent = "Fix and re-enable (test)"; $("test").disabled = false;
  } else {
    dot.classList.add("ok"); $("statusText").textContent = "Routing active";
    $("test").textContent = "Test connection"; $("test").disabled = false;
  }
}

$("test").addEventListener("click", async () => {
  const btn = $("test"), result = $("result");
  btn.disabled = true; result.className = ""; result.textContent = "Testing...";
  const r = await chrome.runtime.sendMessage({ type: "test-connection" });
  if (r.ok) {
    result.className = "ok";
    const loc = [r.city, r.org].filter(Boolean).join(", ");
    result.textContent = `Exit IP: ${r.ip}${loc ? " (" + loc + ")" : ""}`;
  } else {
    result.className = "ko"; result.textContent = r.error || "Test failed.";
  }
  btn.disabled = false; refreshStatus();
});

$("openOptions").addEventListener("click", e => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
refreshStatus();
