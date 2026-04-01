const uidInput = document.getElementById("uidInput");
const hashBtn = document.getElementById("hashBtn");
const enrollBtn = document.getElementById("enrollBtn");
const verifyBtn = document.getElementById("verifyBtn");
const normalizedUidEl = document.getElementById("normalizedUid");
const identityHashEl = document.getElementById("identityHash");
const outputEl = document.getElementById("output");
const healthText = document.getElementById("healthText");
const contractText = document.getElementById("contractText");

function setOutput(message, isError = false) {
  outputEl.textContent = message;
  outputEl.classList.toggle("error", isError);
  outputEl.classList.toggle("success", !isError);
}

function formatBody(body) {
  return JSON.stringify(body, null, 2);
}

async function requestJson(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: formatBody(body)
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || "Request failed");
  }

  return payload;
}

async function refreshHealth() {
  try {
    const response = await fetch("/health");
    const data = await response.json();
    healthText.textContent = data.ok ? "Online" : "Degraded";
    contractText.textContent = data.contractAddress
      ? `Contract: ${data.contractAddress}`
      : "Contract: not loaded yet";
  } catch (error) {
    healthText.textContent = "Offline";
    contractText.textContent = error.message;
  }
}

function readUid() {
  const value = uidInput.value.trim();
  if (!value) {
    throw new Error("Enter an RFID UID first");
  }
  return value;
}

async function handleHash() {
  const uid = readUid();
  setOutput("Hashing UID...");
  const data = await requestJson("/hash", { uid });
  normalizedUidEl.textContent = data.normalizedUid;
  identityHashEl.textContent = data.identityHash;
  setOutput(formatBody(data));
}

async function handleEnroll() {
  const uid = readUid();
  setOutput("Sending enrollment to blockchain...");
  const data = await requestJson("/enroll", { uid });
  normalizedUidEl.textContent = data.normalizedUid || "-";
  identityHashEl.textContent = data.identityHash || "-";
  setOutput(formatBody(data));
}

async function handleVerify() {
  const uid = readUid();
  setOutput("Checking chain authorization...");
  const data = await requestJson("/verify", { uid });
  normalizedUidEl.textContent = data.normalizedUid || "-";
  identityHashEl.textContent = data.identityHash || "-";
  setOutput(formatBody(data), !data.authorized);
}

hashBtn.addEventListener("click", () => {
  handleHash().catch((error) => setOutput(error.message, true));
});

enrollBtn.addEventListener("click", () => {
  handleEnroll().catch((error) => setOutput(error.message, true));
});

verifyBtn.addEventListener("click", () => {
  handleVerify().catch((error) => setOutput(error.message, true));
});

uidInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    handleHash().catch((error) => setOutput(error.message, true));
  }
});

refreshHealth();
