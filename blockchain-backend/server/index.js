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

let contract;
let contractAddress;
let sseClients = [];

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
  const provider = new ethers.JsonRpcProvider(RPC_URL);
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

    const payload = JSON.stringify({ uid: normalizedUid, isAdmin });
    sseClients.forEach((client) => client.res.write(`data: ${payload}\n\n`));

    return res.json({ ok: true, pushed: true });
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
    await tx.wait();

    return res.json({
      authorized: true,
      normalizedUid: identity.normalizedUid,
      identityHash: identity.identityHash,
      transactionHash: tx.hash,
      message: "Hash stored on-chain"
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
    return res.json({
      authorized,
      normalizedUid: identity.normalizedUid,
      identityHash: identity.identityHash,
      message: authorized ? "Identity verified on-chain" : "Identity not found on-chain"
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
