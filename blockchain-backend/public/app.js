const authStatusCard = document.getElementById("authStatusCard");
const authStatusText = document.getElementById("authStatusText");
const identityHashEl = document.getElementById("identityHash");
const outputEl = document.getElementById("output");
const healthText = document.getElementById("healthText");
const contractText = document.getElementById("contractText");

let enrollModeUnlocked = false;

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

function triggerAuthAnimation(isAuthorized) {
  // Remove existing animation classes to re-trigger
  authStatusCard.classList.remove("auth-authorized", "auth-unauthorized", "auth-admin");
  // Force a reflow to restart animation
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
  
  // Keep the JSON response format but hide the normalizedUid from it!
  delete data.normalizedUid;

  identityHashEl.textContent = data.identityHash || "-";
  setOutput(formatBody(data));
  enrollModeUnlocked = false;
  
  triggerAuthAnimation(true);
}

async function handleVerify(uid) {
  setOutput("Checking chain authorization...");
  authStatusText.textContent = "Verifying on Chain...";
  const data = await requestJson("/verify", { uid });
  
  // Keep the JSON response format but hide the normalizedUid from it!
  delete data.normalizedUid;
  
  identityHashEl.textContent = data.identityHash || "-";
  setOutput(formatBody(data), !data.authorized);
  
  triggerAuthAnimation(data.authorized);
}

refreshHealth();

const eventSource = new EventSource("/events");
eventSource.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);
    
    if (data.isAdmin) {
      enrollModeUnlocked = true;
      setOutput("Admin card detected. Ready to enroll next card.");
      authStatusText.textContent = "Admin Mode Unlocked";
      authStatusCard.classList.remove("auth-authorized", "auth-unauthorized", "auth-admin");
      void authStatusCard.offsetWidth;
      authStatusCard.classList.add("auth-admin");
    } else {
      if (enrollModeUnlocked) {
        setOutput("Normal card detected. Auto-enrolling...");
        handleEnroll(data.uid).catch((error) => {
          setOutput(error.message, true);
          triggerAuthAnimation(false);
        });
      } else {
        setOutput("Normal card detected. Auto-verifying...");
        handleVerify(data.uid).catch((error) => {
          setOutput(error.message, true);
          triggerAuthAnimation(false);
        });
      }
    }
  } catch (err) {
    console.error("SSE parse error", err);
  }
};
