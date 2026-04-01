# Blockchain RFID

This repo is split into two parts:

- `decentralized fid/` - the original ESP32 RFID prototype
- `blockchain-backend/` - the new blockchain backend, smart contract, and browser UI

## What the backend does

The backend follows the report workflow:

1. Accept a raw RFID UID.
2. Normalize it into lowercase hex.
3. Hash the normalized UID with SHA-256.
4. Store the resulting hash in the `IdentityRegistry` smart contract.
5. Verify future scans against the chain.

## Root scripts

Run these from the repo root:

- `npm run backend:install`
- `npm run backend:compile`
- `npm run backend:node`
- `npm run backend:deploy`
- `npm run backend:server`
- `npm run backend:run`

`backend:run` is the fast path for most demos. It compiles the contract, deploys it to the local Hardhat chain, and starts the Express server.

## Typical run order

Open three terminals:

1. Terminal 1
   - `npm run backend:node`
2. Terminal 2
   - `npm run backend:deploy`
   - `npm run backend:server`
3. Browser
   - open `http://127.0.0.1:3000/`

## For the RFID team

If you worked on the ESP32 codebase, the important thing to know is that the backend is intentionally standalone for now. It does not require the RFID firmware to be flashed to test the blockchain workflow.

Use the browser UI to try:

- `Hash UID`
- `Enroll on Chain`
- `Verify on Chain`

## Folder docs

The backend folder has its own detailed walkthrough in [`blockchain-backend/README.md`](./blockchain-backend/README.md).
