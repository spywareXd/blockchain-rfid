const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { ethers } = require("ethers");
const { buildIdentityFromUid, getIdentityFromBody, normalizeUidInput } = require("./identity");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

const PORT = Number(process.env.PORT || 3000);
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const DEPLOYMENT_FILE = process.env.DEPLOYMENT_FILE || path.join(__dirname, "..", "deployments", "localhost.json");
const ARTIFACT_PATH = path.join(__dirname, "..", "artifacts", "contracts", "IdentityRegistry.sol", "IdentityRegistry.json");
const COORDINATES_FILE = process.env.COORDINATES_FILE || path.join(__dirname, "..", "data", "coordinates.json");
const LOCATION_HISTORY_LIMIT = 200;
const DEFAULT_MAP_CENTER = {
  lat: 12.9165,
  lng: 79.1325,
  label: "Vellore, Tamil Nadu"
};

const provider = new ethers.JsonRpcProvider(RPC_URL);
let contract;
let contractAddress;
let sseClients = [];

function ensureCoordinatesStore() {
  const storeDir = path.dirname(COORDINATES_FILE);
  fs.mkdirSync(storeDir, { recursive: true });

  if (!fs.existsSync(COORDINATES_FILE)) {
    fs.writeFileSync(
      COORDINATES_FILE,
      JSON.stringify(
        {
          uidColors: {},
          scans: []
        },
        null,
        2
      )
    );
  }
}

function loadCoordinatesStore() {
  ensureCoordinatesStore();

  const raw = JSON.parse(fs.readFileSync(COORDINATES_FILE, "utf8"));
  return {
    uidColors: raw.uidColors && typeof raw.uidColors === "object" ? raw.uidColors : {},
    scans: Array.isArray(raw.scans) ? raw.scans : []
  };
}

function saveCoordinatesStore(store) {
  ensureCoordinatesStore();
  fs.writeFileSync(COORDINATES_FILE, JSON.stringify(store, null, 2));
}

function isValidCoordinate(value, min, max) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= min && numeric <= max;
}

function toFiniteCoordinate(value) {
  return Number(Number(value).toFixed(6));
}

function hslToHex(h, s, l) {
  const saturation = s / 100;
  const lightness = l / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const hueSegment = h / 60;
  const secondComponent = chroma * (1 - Math.abs(hueSegment % 2 - 1));
  let red = 0;
  let green = 0;
  let blue = 0;

  if (hueSegment >= 0 && hueSegment < 1) {
    red = chroma;
    green = secondComponent;
  } else if (hueSegment < 2) {
    red = secondComponent;
    green = chroma;
  } else if (hueSegment < 3) {
    green = chroma;
    blue = secondComponent;
  } else if (hueSegment < 4) {
    green = secondComponent;
    blue = chroma;
  } else if (hueSegment < 5) {
    red = secondComponent;
    blue = chroma;
  } else {
    red = chroma;
    blue = secondComponent;
  }

  const match = lightness - chroma / 2;
  const toHex = (value) => Math.round((value + match) * 255).toString(16).padStart(2, "0");

  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

function createColorForIndex(index) {
  const hue = Math.round((index * 137.508) % 360);
  return hslToHex(hue, 78, 60);
}

function getColorForUid(store, uid) {
  if (store.uidColors[uid]) {
    return store.uidColors[uid];
  }

  const color = createColorForIndex(Object.keys(store.uidColors).length);
  store.uidColors[uid] = color;
  return color;
}

function recordLocationScan({ uid, lat, lng, label, source }) {
  const store = loadCoordinatesStore();
  const color = getColorForUid(store, uid);
  let savedEntry = null;

  if (isValidCoordinate(lat, -90, 90) && isValidCoordinate(lng, -180, 180)) {
    savedEntry = {
      id: `${Date.now()}-${uid}`,
      uid,
      lat: toFiniteCoordinate(lat),
      lng: toFiniteCoordinate(lng),
      label: typeof label === "string" && label.trim() ? label.trim() : null,
      source: source || "device",
      scannedAt: new Date().toISOString()
    };

    store.scans.push(savedEntry);
    if (store.scans.length > LOCATION_HISTORY_LIMIT) {
      store.scans = store.scans.slice(-LOCATION_HISTORY_LIMIT);
    }
  }

  saveCoordinatesStore(store);

  return {
    color,
    savedEntry: savedEntry ? { ...savedEntry, color } : null
  };
}

function buildLocationsResponse() {
  const store = loadCoordinatesStore();
  const scans = [...store.scans]
    .map((scan) => ({
      ...scan,
      color: store.uidColors[scan.uid] || createColorForIndex(Object.keys(store.uidColors).length)
    }))
    .sort((left, right) => new Date(right.scannedAt).getTime() - new Date(left.scannedAt).getTime());

  const latestScan = scans[0] || null;
  const scanStats = new Map();

  scans.forEach((scan) => {
    const existing = scanStats.get(scan.uid);
    if (existing) {
      existing.scanCount += 1;
      if (!existing.lastLabel && scan.label) {
        existing.lastLabel = scan.label;
      }
      return;
    }

    scanStats.set(scan.uid, {
      lastSeen: scan.scannedAt,
      lastLabel: scan.label || null,
      scanCount: 1
    });
  });

  const legend = Object.entries(store.uidColors).map(([uid, color]) => {
    const stats = scanStats.get(uid);
    return {
      uid,
      color,
      scanCount: stats?.scanCount || 0,
      lastSeen: stats?.lastSeen || null,
      lastLabel: stats?.lastLabel || null
    };
  }).sort((left, right) => {
    const leftTime = left.lastSeen ? new Date(left.lastSeen).getTime() : 0;
    const rightTime = right.lastSeen ? new Date(right.lastSeen).getTime() : 0;
    return rightTime - leftTime;
  });

  return {
    ok: true,
    center: latestScan
      ? {
          lat: latestScan.lat,
          lng: latestScan.lng,
          label: latestScan.label || latestScan.uid
        }
      : DEFAULT_MAP_CENTER,
    trackedUids: Object.keys(store.uidColors).length,
    totalScans: scans.length,
    legend,
    recentScans: scans.slice(0, 12),
    scans
  };
}

async function getRecentBlocks(limit = 6) {
  const latestNumber = await provider.getBlockNumber();
  const blocks = [];

  for (let blockNumber = latestNumber; blockNumber >= 0 && blocks.length < limit; blockNumber -= 1) {
    const block = await provider.getBlock(blockNumber);
    if (!block) {
      continue;
    }

    blocks.push({
      number: block.number,
      hash: block.hash,
      parentHash: block.parentHash,
      transactionCount: block.transactions.length,
      timestamp: block.timestamp
    });
  }

  return blocks;
}

function loadArtifact() {
  if (!fs.existsSync(ARTIFACT_PATH)) {
    throw new Error(
      "Missing Hardhat artifact. Run `npm run compile` inside blockchain-backend first."
    );
  }

  return JSON.parse(fs.readFileSync(ARTIFACT_PATH, "utf8"));
}

function loadDeployment() {
  if (!fs.existsSync(DEPLOYMENT_FILE)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(DEPLOYMENT_FILE, "utf8"));
}

function isValidHash(hash) {
  return typeof hash === "string" && /^[0-9a-fA-F]{64}$/.test(hash);
}

function toBytes32(hash) {
  return `0x${hash}`;
}

async function deployIfNeeded(signer, artifact) {
  const existingDeployment = loadDeployment();
  if (existingDeployment?.address) {
    return existingDeployment.address;
  }

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);
  const deployed = await factory.deploy();
  await deployed.waitForDeployment();
  const address = await deployed.getAddress();

  const deploymentsDir = path.dirname(DEPLOYMENT_FILE);
  fs.mkdirSync(deploymentsDir, { recursive: true });
  fs.writeFileSync(
    DEPLOYMENT_FILE,
    JSON.stringify(
      {
        address,
        chainId: Number(process.env.CHAIN_ID || 31337),
        deployedAt: new Date().toISOString()
      },
      null,
      2
    )
  );

  return address;
}

async function createContract() {
  const signer = PRIVATE_KEY ? new ethers.Wallet(PRIVATE_KEY, provider) : await provider.getSigner(0);
  const artifact = loadArtifact();
  const address = process.env.CONTRACT_ADDRESS || (await deployIfNeeded(signer, artifact));

  contractAddress = address;
  contract = new ethers.Contract(address, artifact.abi, signer);

  console.log(`Middleware connected to IdentityRegistry at ${address}`);
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    contractAddress: contractAddress || null
  });
});

app.get("/contract", (_req, res) => {
  res.json({
    address: contractAddress || null
  });
});

app.get("/chain", async (req, res) => {
  try {
    const parsedLimit = Number(req.query.limit || 6);
    const limit = Number.isInteger(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 12) : 6;
    const blocks = await getRecentBlocks(limit);

    return res.json({
      ok: true,
      latestBlockNumber: blocks[0]?.number ?? null,
      blocks
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error.message || "Unable to fetch chain data",
      blocks: []
    });
  }
});

app.get("/locations", (_req, res) => {
  try {
    return res.json(buildLocationsResponse());
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error.message || "Unable to load saved coordinates",
      center: DEFAULT_MAP_CENTER,
      trackedUids: 0,
      totalScans: 0,
      legend: [],
      recentScans: [],
      scans: []
    });
  }
});

app.post("/hash", (req, res) => {
  try {
    const identity = buildIdentityFromUid(req.body?.uid);
    return res.json({
      normalizedUid: identity.normalizedUid,
      identityHash: identity.identityHash
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      message: error.message || "Hashing failed"
    });
  }
});

app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const clientId = Date.now();
  sseClients.push({ id: clientId, res });

  req.on("close", () => {
    sseClients = sseClients.filter((c) => c.id !== clientId);
  });
});

app.post("/scan", (req, res) => {
  try {
    const rawUid = req.body?.uid;
    if (!rawUid) {
      return res.status(400).json({ ok: false, message: "Missing uid" });
    }
    const normalizedUid = normalizeUidInput(rawUid);
    const adminNormalized = normalizeUidInput(process.env.ADMIN_UID || "17:63:0d:06");
    const isAdmin = (normalizedUid === adminNormalized);
    const { color, savedEntry } = recordLocationScan({
      uid: normalizedUid,
      lat: req.body?.lat,
      lng: req.body?.lng,
      label: req.body?.label,
      source: req.body?.source || "device"
    });

    const payload = JSON.stringify({
      uid: normalizedUid,
      isAdmin,
      color,
      lat: savedEntry?.lat ?? null,
      lng: savedEntry?.lng ?? null,
      scannedAt: savedEntry?.scannedAt ?? null
    });
    sseClients.forEach((client) => client.res.write(`data: ${payload}\n\n`));

    return res.json({
      ok: true,
      pushed: true,
      color,
      locationStored: Boolean(savedEntry),
      location: savedEntry
    });
  } catch (err) {
    return res.status(400).json({ ok: false, message: err.message });
  }
});

app.post("/enroll", async (req, res) => {
  try {
    const identity = getIdentityFromBody(req.body);
    if (!isValidHash(identity.identityHash)) {
      return res.status(400).json({
        authorized: false,
        message: "Invalid UID or hash payload"
      });
    }

    const tx = await contract.authorizeHash(toBytes32(identity.identityHash));
    const receipt = await tx.wait();
    const block = await provider.getBlock(receipt.blockNumber);

    return res.json({
      authorized: true,
      normalizedUid: identity.normalizedUid,
      identityHash: identity.identityHash,
      transactionHash: tx.hash,
      message: "Hash stored on-chain",
      blockHeight: receipt.blockNumber,
      blockHash: receipt.blockHash,
      previousHash: block?.parentHash || null
    });
  } catch (error) {
    return res.status(500).json({
      authorized: false,
      message: error.message || "Enrollment failed"
    });
  }
});

app.post("/verify", async (req, res) => {
  try {
    const identity = getIdentityFromBody(req.body);
    if (!isValidHash(identity.identityHash)) {
      return res.status(400).json({
        authorized: false,
        message: "Invalid UID or hash payload"
      });
    }

    const authorized = await contract.isAuthorized(toBytes32(identity.identityHash));
    const block = await provider.getBlock("latest");

    return res.json({
      authorized,
      normalizedUid: identity.normalizedUid,
      identityHash: identity.identityHash,
      message: authorized ? "Identity verified on-chain" : "Identity not found on-chain",
      blockHeight: block?.number ?? null,
      blockHash: block?.hash || null,
      previousHash: block?.parentHash || null
    });
  } catch (error) {
    return res.status(500).json({
      authorized: false,
      message: error.message || "Verification failed"
    });
  }
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

async function start() {
  await createContract();

  app.listen(PORT, () => {
    console.log(`RFID middleware listening on http://127.0.0.1:${PORT}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
