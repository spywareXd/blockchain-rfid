const authStatusCard = document.getElementById("authStatusCard");
const authStatusText = document.getElementById("authStatusText");
const identityHashEl = document.getElementById("identityHash");
const outputEl = document.getElementById("output");
const healthText = document.getElementById("healthText");
const contractText = document.getElementById("contractText");
const blockHeightEl = document.getElementById("blockHeight");
const blockHashEl = document.getElementById("blockHash");
const previousHashEl = document.getElementById("previousHash");
const chainDiagramEl = document.getElementById("chainDiagram");
const refreshChainButton = document.getElementById("refreshChainButton");
const tabButtons = Array.from(document.querySelectorAll(".tab-button"));
const tabViews = Array.from(document.querySelectorAll(".tab-view"));
const gpsMapEl = document.getElementById("gpsMap");
const mapLegendEl = document.getElementById("mapLegend");
const scanHistoryEl = document.getElementById("scanHistory");
const trackedUidCountEl = document.getElementById("trackedUidCount");
const totalCoordinateScansEl = document.getElementById("totalCoordinateScans");
const mapCenterLabelEl = document.getElementById("mapCenterLabel");
const mapStatusTextEl = document.getElementById("mapStatusText");
const refreshLocationsButton = document.getElementById("refreshLocationsButton");

let enrollModeUnlocked = false;
let gpsMap = null;
let gpsMarkerLayer = null;

function setOutput(message, isError = false) {
  outputEl.textContent = message;
  outputEl.classList.toggle("error", isError);
  outputEl.classList.toggle("success", !isError);
}

function formatBody(body) {
  return JSON.stringify(body, null, 2);
}

async function readJsonResponse(response, fallbackMessage) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message || fallbackMessage);
    }

    return payload;
  }

  const text = (await response.text()).trim();
  const message = text
    ? `${fallbackMessage}: ${text.slice(0, 120)}`
    : fallbackMessage;

  throw new Error(message);
}

function shortHash(value) {
  if (!value || value === "-") {
    return "-";
  }

  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTimestamp(value) {
  if (!value) {
    return "Unknown time";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function updateBlockSummary(data = {}) {
  blockHeightEl.textContent = data.blockHeight ?? data.number ?? "-";
  blockHashEl.textContent = data.blockHash || data.hash || "-";
  previousHashEl.textContent = data.previousHash || data.parentHash || "-";
}

function activateTab(targetId) {
  tabButtons.forEach((button) => {
    const isActive = button.dataset.target === targetId;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  tabViews.forEach((view) => {
    view.classList.toggle("active", view.id === targetId);
  });

  if (targetId === "mapView") {
    refreshLocations().catch(() => {});
    if (gpsMap) {
      setTimeout(() => gpsMap.invalidateSize(), 0);
    }
  }
}

function attachTabListeners() {
  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activateTab(button.dataset.target);
    });
  });
}

async function requestJson(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: formatBody(body)
  });

  return readJsonResponse(response, "Request failed");
}

async function refreshHealth() {
  try {
    const response = await fetch("/health");
    const data = await readJsonResponse(response, "Unable to load backend health");
    healthText.textContent = data.ok ? "Online" : "Degraded";
    contractText.textContent = data.contractAddress
      ? `Contract: ${data.contractAddress}`
      : "Contract: not loaded yet";
  } catch (error) {
    healthText.textContent = "Offline";
    contractText.textContent = error.message;
  }
}

function renderChain(blocks) {
  chainDiagramEl.innerHTML = "";

  if (!blocks.length) {
    const placeholder = document.createElement("p");
    placeholder.className = "chain-placeholder";
    placeholder.textContent = "No block data available yet.";
    chainDiagramEl.appendChild(placeholder);
    return;
  }

  blocks.forEach((block, index) => {
    const card = document.createElement("article");
    card.className = "chain-block";

    const title = document.createElement("div");
    title.className = "chain-block-title";
    title.textContent = index === 0 ? `Latest Block #${block.number}` : `Block #${block.number}`;

    const meta = document.createElement("div");
    meta.className = "chain-block-meta";
    meta.innerHTML = [
      `<span>Hash</span><strong title="${escapeHtml(block.hash)}">${escapeHtml(shortHash(block.hash))}</strong>`,
      `<span>Parent</span><strong title="${escapeHtml(block.parentHash)}">${escapeHtml(shortHash(block.parentHash))}</strong>`,
      `<span>Transactions</span><strong>${escapeHtml(block.transactionCount)}</strong>`
    ].join("");

    card.appendChild(title);
    card.appendChild(meta);
    chainDiagramEl.appendChild(card);

    if (index < blocks.length - 1) {
      const connector = document.createElement("div");
      connector.className = "chain-link";
      connector.textContent = "links to previous block";
      chainDiagramEl.appendChild(connector);
    }
  });
}

async function refreshChain() {
  try {
    const response = await fetch("/chain?limit=6");
    const data = await readJsonResponse(response, "Unable to load chain data");
    renderChain(data.blocks || []);
    if (data.blocks?.length) {
      updateBlockSummary(data.blocks[0]);
    }
  } catch (error) {
    chainDiagramEl.innerHTML = "";
    const placeholder = document.createElement("p");
    placeholder.className = "chain-placeholder error";
    placeholder.textContent = error.message;
    chainDiagramEl.appendChild(placeholder);
  }
}

function ensureMapReady(center) {
  if (gpsMap || !gpsMapEl) {
    return;
  }

  if (!window.L) {
    gpsMapEl.innerHTML = "<div class=\"map-fallback\">Leaflet could not load. Check internet access to load the map view.</div>";
    return;
  }

  gpsMap = window.L.map(gpsMapEl, {
    zoomControl: true,
    scrollWheelZoom: true
  }).setView([center.lat, center.lng], 13);

  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19
  }).addTo(gpsMap);

  gpsMarkerLayer = window.L.layerGroup().addTo(gpsMap);
}

function renderLegend(legend) {
  mapLegendEl.innerHTML = "";

  if (!legend.length) {
    const placeholder = document.createElement("p");
    placeholder.className = "chain-placeholder";
    placeholder.textContent = "No UID colors assigned yet.";
    mapLegendEl.appendChild(placeholder);
    return;
  }

  legend.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "legend-item";
    row.innerHTML = [
      `<span class="legend-swatch" style="background:${escapeHtml(entry.color)};"></span>`,
      "<div>",
      `<strong>${escapeHtml(entry.uid)}</strong>`,
      `<small>${escapeHtml(entry.scanCount)} scan${entry.scanCount === 1 ? "" : "s"}${entry.lastLabel ? ` · ${escapeHtml(entry.lastLabel)}` : ""}</small>`,
      "</div>"
    ].join("");
    mapLegendEl.appendChild(row);
  });
}

function renderScanHistory(scans) {
  scanHistoryEl.innerHTML = "";

  if (!scans.length) {
    const placeholder = document.createElement("p");
    placeholder.className = "chain-placeholder";
    placeholder.textContent = "No saved coordinate scans yet.";
    scanHistoryEl.appendChild(placeholder);
    return;
  }

  scans.forEach((scan) => {
    const row = document.createElement("article");
    row.className = "history-item";
    row.innerHTML = [
      `<span class="history-swatch" style="background:${escapeHtml(scan.color)};"></span>`,
      "<div>",
      `<strong>${escapeHtml(scan.uid)}</strong>`,
      `<small>${escapeHtml(scan.label || "Unlabeled point")} · ${escapeHtml(formatTimestamp(scan.scannedAt))}</small>`,
      `<small>${escapeHtml(scan.lat.toFixed(6))}, ${escapeHtml(scan.lng.toFixed(6))}</small>`,
      "</div>"
    ].join("");
    scanHistoryEl.appendChild(row);
  });
}

function renderLocations(data) {
  trackedUidCountEl.textContent = data.trackedUids ?? "-";
  totalCoordinateScansEl.textContent = data.totalScans ?? "-";
  mapCenterLabelEl.textContent = data.center?.label || "Vellore, Tamil Nadu";
  mapStatusTextEl.textContent = `${data.totalScans} stored coordinate scans across ${data.trackedUids} RFID UIDs.`;

  renderLegend(data.legend || []);
  renderScanHistory(data.recentScans || []);

  ensureMapReady(data.center || { lat: 12.9165, lng: 79.1325 });
  if (!gpsMap || !gpsMarkerLayer) {
    return;
  }

  gpsMarkerLayer.clearLayers();
  const bounds = [];

  (data.scans || []).forEach((scan) => {
    if (!Number.isFinite(scan.lat) || !Number.isFinite(scan.lng)) {
      return;
    }

    const marker = window.L.circleMarker([scan.lat, scan.lng], {
      radius: 9,
      color: scan.color,
      fillColor: scan.color,
      fillOpacity: 0.8,
      weight: 2
    });

    marker.bindPopup(
      [
        `<strong>${escapeHtml(scan.uid)}</strong>`,
        scan.label ? `<br>${escapeHtml(scan.label)}` : "",
        `<br>${escapeHtml(scan.lat.toFixed(6))}, ${escapeHtml(scan.lng.toFixed(6))}`,
        `<br>${escapeHtml(formatTimestamp(scan.scannedAt))}`
      ].join("")
    );

    marker.addTo(gpsMarkerLayer);
    bounds.push([scan.lat, scan.lng]);
  });

  if (!bounds.length) {
    gpsMap.setView([data.center.lat, data.center.lng], 13);
    return;
  }

  if (bounds.length === 1) {
    gpsMap.setView(bounds[0], 15);
    return;
  }

  gpsMap.fitBounds(bounds, {
    padding: [30, 30]
  });
}

async function refreshLocations() {
  try {
    const response = await fetch("/locations");
    const data = await readJsonResponse(response, "Unable to load saved coordinates");
    renderLocations(data);
  } catch (error) {
    mapStatusTextEl.textContent = error.message;
    mapLegendEl.innerHTML = `<p class="chain-placeholder error">${escapeHtml(error.message)}</p>`;
    scanHistoryEl.innerHTML = `<p class="chain-placeholder error">${escapeHtml(error.message)}</p>`;
    if (gpsMapEl && !gpsMap) {
      gpsMapEl.innerHTML = `<div class="map-fallback error">${escapeHtml(error.message)}</div>`;
    }
  }
}

function triggerAuthAnimation(isAuthorized) {
  authStatusCard.classList.remove("auth-authorized", "auth-unauthorized", "auth-admin");
  void authStatusCard.offsetWidth;

  if (isAuthorized) {
    authStatusCard.classList.add("auth-authorized");
    authStatusText.textContent = "Access Permitted";
  } else {
    authStatusCard.classList.add("auth-unauthorized");
    authStatusText.textContent = "Access Denied";
  }
}

async function handleEnroll(uid) {
  setOutput("Sending enrollment to blockchain...");
  authStatusText.textContent = "Processing Enrollment...";
  const data = await requestJson("/enroll", { uid });

  delete data.normalizedUid;

  identityHashEl.textContent = data.identityHash || "-";
  updateBlockSummary(data);
  setOutput(formatBody(data));
  enrollModeUnlocked = false;
  refreshChain().catch(() => {});

  triggerAuthAnimation(true);
}

async function handleVerify(uid) {
  setOutput("Checking chain authorization...");
  authStatusText.textContent = "Verifying on Chain...";
  const data = await requestJson("/verify", { uid });

  delete data.normalizedUid;

  identityHashEl.textContent = data.identityHash || "-";
  updateBlockSummary(data);
  setOutput(formatBody(data), !data.authorized);
  refreshChain().catch(() => {});

  triggerAuthAnimation(data.authorized);
}

attachTabListeners();
refreshHealth();
refreshChain();
refreshLocations();

refreshChainButton.addEventListener("click", () => {
  refreshChain().catch((error) => {
    setOutput(error.message, true);
  });
});

refreshLocationsButton.addEventListener("click", () => {
  refreshLocations().catch((error) => {
    mapStatusTextEl.textContent = error.message;
  });
});

const eventSource = new EventSource("/events");
eventSource.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);

    refreshLocations().catch(() => {});

    if (data.isAdmin) {
      enrollModeUnlocked = true;
      setOutput("Admin card detected. Ready to enroll next card.");
      authStatusText.textContent = "Admin Mode Unlocked";
      authStatusCard.classList.remove("auth-authorized", "auth-unauthorized", "auth-admin");
      void authStatusCard.offsetWidth;
      authStatusCard.classList.add("auth-admin");
      return;
    }

    if (enrollModeUnlocked) {
      setOutput("Normal card detected. Auto-enrolling...");
      handleEnroll(data.uid).catch((error) => {
        setOutput(error.message, true);
        triggerAuthAnimation(false);
      });
      return;
    }

    setOutput("Normal card detected. Auto-verifying...");
    handleVerify(data.uid).catch((error) => {
      setOutput(error.message, true);
      triggerAuthAnimation(false);
    });
  } catch (error) {
    console.error("SSE parse error", error);
  }
};
