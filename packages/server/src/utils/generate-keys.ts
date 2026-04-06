// =============================================================================
// EMP CLOUD — RSA Key Pair Generator
// Run with: pnpm generate-keys
// Generates RS256 key pair for OAuth2 JWT signing.
// =============================================================================

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const keysDir = path.resolve(process.cwd(), "keys");

/* v8 ignore start */
if (!fs.existsSync(keysDir)) {
  fs.mkdirSync(keysDir, { recursive: true });
}
/* v8 ignore stop */

const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

fs.writeFileSync(path.join(keysDir, "private.pem"), privateKey);
fs.writeFileSync(path.join(keysDir, "public.pem"), publicKey);

console.log(`RS256 key pair generated in ${keysDir}/`);
console.log("  - private.pem (keep secret!)");
console.log("  - public.pem (distribute to modules)");
