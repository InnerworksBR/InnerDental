import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const required = (name) => { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name}_REQUIRED`); return value; };
const revision = required("RELEASE_REVISION"); const webDigest = required("WEB_DIGEST"); const workerDigest = required("WORKER_DIGEST");
if (!/^[a-f0-9]{7,64}$/i.test(revision)) throw new Error("RELEASE_REVISION_INVALID");
for (const [name, value] of [["WEB_DIGEST", webDigest], ["WORKER_DIGEST", workerDigest]]) if (!/^sha256:[a-f0-9]{64}$/i.test(value)) throw new Error(`${name}_INVALID`);
const testReceiptPath = required("TEST_RECEIPT"); const migrationReceiptPath = required("MIGRATION_RECEIPT");
const testReceipt = readFileSync(testReceiptPath, "utf8"); const migrationReceipt = JSON.parse(readFileSync(migrationReceiptPath, "utf8"));
if (migrationReceipt.destructiveFindings?.length || !migrationReceipt.migrationCount) throw new Error("MIGRATION_RECEIPT_INVALID");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const manifest = {
  schemaVersion: 1, revision, createdAt: new Date().toISOString(),
  images: { web: webDigest, worker: workerDigest },
  evidence: { testReceiptSha256: sha256(testReceipt), migrationReceiptSha256: sha256(JSON.stringify(migrationReceipt)), dependencyLockSha256: sha256(readFileSync("pnpm-lock.yaml", "utf8")), migrationCount: migrationReceipt.migrationCount },
  rollout: { migrationStrategy: "expand-forward-fix", rebuildBetweenEnvironments: false }
};
const output = process.env.RELEASE_MANIFEST ?? "release-manifest.json";
writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
console.log(`Release manifest created for revision ${revision.slice(0, 12)}.`);
