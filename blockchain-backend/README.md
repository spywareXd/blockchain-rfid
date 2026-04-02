# Blockchain Backend

This folder contains the standalone backend for the RFID blockchain workflow.

## Concept

The backend is responsible for the blockchain side of the system. It does not depend on the ESP32 firmware right now, which makes it easier to test and explain.

The flow is:

1. Receive a raw RFID UID from the browser UI or an API client.
2. Normalize the UID into a compact lowercase hex string.
3. Hash the normalized UID with SHA-256.
4. Store the hash in the `IdentityRegistry` smart contract.
5. Check the same hash later to verify access.

## Files

- `contracts/IdentityRegistry.sol` - simple on-chain registry of authorized hashes
- `scripts/compile.js` - compiles the Solidity contract using local `solc`
- `scripts/deploy.js` - deploys the contract to the local Hardhat chain
- `server/index.js` - Express API and static frontend server
- `server/identity.js` - UID normalization and hashing helpers
- `public/` - simple browser UI for testing the backend

## Root script mapping

From the repo root, use:

- `npm run backend:install` - install backend dependencies
- `npm run backend:compile` - compile the smart contract
- `npm run backend:node` - start the local Hardhat chain
- `npm run backend:deploy` - deploy the contract to the chain
- `npm run backend:server` - start the Express server and frontend
- `npm run backend:run` - compile, deploy, and start the server in one go

## API

- `POST /hash`
  - body: `{ "uid": "17:63:0d:06" }`
  - returns the normalized UID and SHA-256 hash

- `POST /enroll`
  - body: `{ "uid": "17:63:0d:06" }`
  - hashes the UID and stores the hash on-chain

- `POST /verify`
  - body: `{ "uid": "17:63:0d:06" }`
  - hashes the UID and checks whether the hash is authorized

- `GET /health`
  - returns basic backend status

## Browser UI

Open `http://127.0.0.1:3000/` after starting the backend server.

The page has three actions:

- `Hash UID`
- `Enroll on Chain`
- `Verify on Chain`

## Notes for the RFID side

This backend is separate from the current ESP32 firmware on purpose. It is meant to prove the blockchain logic first, then get wired into the RFID device later.
