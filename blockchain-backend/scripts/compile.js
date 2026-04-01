const fs = require("fs");
const path = require("path");
const solc = require("solc");

const projectRoot = path.join(__dirname, "..");
const sourcePath = path.join(projectRoot, "contracts", "IdentityRegistry.sol");
const artifactPath = path.join(
  projectRoot,
  "artifacts",
  "contracts",
  "IdentityRegistry.sol",
  "IdentityRegistry.json"
);

function loadSource() {
  return fs.readFileSync(sourcePath, "utf8");
}

function compile() {
  const input = {
    language: "Solidity",
    sources: {
      "IdentityRegistry.sol": {
        content: loadSource()
      }
    },
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"]
        }
      }
    }
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  if (output.errors && output.errors.length) {
    const fatalErrors = output.errors.filter((entry) => entry.severity === "error");
    output.errors.forEach((entry) => {
      const prefix = entry.severity === "error" ? "ERROR" : "WARN";
      console.log(`${prefix}: ${entry.formattedMessage || entry.message}`);
    });

    if (fatalErrors.length) {
      throw new Error("Solidity compilation failed");
    }
  }

  const contract = output.contracts["IdentityRegistry.sol"].IdentityRegistry;
  const artifact = {
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`,
    deployedBytecode: `0x${contract.evm.deployedBytecode.object}`,
    linkReferences: {},
    deployedLinkReferences: {}
  };

  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
  console.log(`Wrote artifact to ${artifactPath}`);
}

compile();
