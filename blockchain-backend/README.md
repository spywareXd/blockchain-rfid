# Blockchain Backend

This folder contains the standalone backend for the RFID blockchain workflow.

## What it does

- accepts a raw RFID UID
- normalizes the UID into a lowercase hex string
- hashes the normalized UID with SHA-256
- writes the resulting hash to the `IdentityRegistry` smart contract
- verifies hashes against the contract on demand

## Start flow

1. `npm install`
2. `npm run node`
3. `npm run compile`
4. `npm run deploy:local`
5. `npm run server`

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

## Frontend

Run the server and open `http://127.0.0.1:3000/` to use the built-in browser UI.
