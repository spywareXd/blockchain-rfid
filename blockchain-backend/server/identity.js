const crypto = require("crypto");

function normalizeUidInput(uid) {
  if (Array.isArray(uid)) {
    return uid
      .map((value) => {
        const byte = Number(value);
        if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
          throw new Error("UID array must contain byte values between 0 and 255");
        }
        return byte.toString(16).padStart(2, "0");
      })
      .join("")
      .toLowerCase();
  }

  if (Buffer.isBuffer(uid)) {
    return uid.toString("hex").toLowerCase();
  }

  if (typeof uid === "string") {
    return uid
      .trim()
      .toLowerCase()
      .replace(/^0x/, "")
      .replace(/[^0-9a-f]/g, "");
  }

  throw new Error("UID must be provided as a hex string, byte array, or buffer");
}

function assertValidNormalizedUid(normalizedUid) {
  if (!normalizedUid || normalizedUid.length % 2 !== 0 || !/^[0-9a-f]+$/.test(normalizedUid)) {
    throw new Error("UID must be a valid even-length hex value");
  }
}

function hashNormalizedUid(normalizedUid) {
  assertValidNormalizedUid(normalizedUid);
  return crypto.createHash("sha256").update(normalizedUid, "utf8").digest("hex");
}

function buildIdentityFromUid(uid) {
  const normalizedUid = normalizeUidInput(uid);
  const identityHash = hashNormalizedUid(normalizedUid);

  return {
    normalizedUid,
    identityHash
  };
}

function normalizeHashInput(hash) {
  if (typeof hash !== "string") {
    throw new Error("Hash must be a hex string");
  }

  const normalized = hash.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error("Hash must be a 32-byte hex value");
  }

  return normalized;
}

function getIdentityFromBody(body = {}) {
  if (body.uid !== undefined) {
    return {
      ...buildIdentityFromUid(body.uid),
      source: "uid"
    };
  }

  if (body.hash !== undefined) {
    return {
      normalizedUid: null,
      identityHash: normalizeHashInput(body.hash),
      source: "hash"
    };
  }

  throw new Error("Request body must include either uid or hash");
}

module.exports = {
  buildIdentityFromUid,
  getIdentityFromBody,
  normalizeHashInput,
  normalizeUidInput
};
