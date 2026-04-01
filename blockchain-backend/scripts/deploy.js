const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;

const projectRoot = path.join(__dirname, "..");
const artifactPath = path.join(
  projectRoot,
  "artifacts",
  "contracts",
  "IdentityRegistry.sol",
  "IdentityRegistry.json"
);
const deploymentPath = path.join(projectRoot, "deployments", "localhost.json");

function loadArtifact() {
  if (!fs.existsSync(artifactPath)) {
    throw new Error(
      "Missing compiled artifact. Run `npm run compile` inside blockchain-backend first."
    );
  }

  return JSON.parse(fs.readFileSync(artifactPath, "utf8"));
}

async function main() {
  const artifact = loadArtifact();
  const provider = ethers.provider;
  const signer = await provider.getSigner(0);
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const deployment = {
    address,
    chainId: Number(process.env.CHAIN_ID || 31337),
    deployedAt: new Date().toISOString()
  };

  fs.mkdirSync(path.dirname(deploymentPath), { recursive: true });
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));

  console.log(`IdentityRegistry deployed to ${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
