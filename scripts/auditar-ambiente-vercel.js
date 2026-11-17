const { createHash } = require("node:crypto");

const required = [
  "ADMIN_SESSION_SECRET",
  "MONTADOR_SESSION_SECRET",
  "SMTP_CONFIG_ENCRYPTION_KEY",
  "PAYMENT_CONFIG_ENCRYPTION_KEY",
  "PAYMENT_WEBHOOK_SECRET",
  "BLOB_READ_WRITE_TOKEN",
  "BLOB_STORE_ID",
  "FIREBASE_SERVICE_ACCOUNT_JSON",
  "PUBLIC_SITE_URL",
];

function firstValue(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
  }
  return "";
}

function fingerprint(value) {
  if (!value) return null;
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function databaseIdentity(rawUrl) {
  if (!rawUrl) return "";
  const parsed = new URL(rawUrl);
  return `${parsed.hostname.toLowerCase()}${parsed.pathname.toLowerCase()}`;
}

const databaseUrl = firstValue("DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL");
const present = Object.fromEntries(required.map((name) => [name, Boolean(firstValue(name))]));
present.DATABASE = Boolean(databaseUrl);

const result = {
  present,
  databaseFingerprint: fingerprint(databaseIdentity(databaseUrl)),
  blobFingerprint: fingerprint(firstValue("BLOB_STORE_ID")),
  smtpKeyFingerprint: fingerprint(firstValue("SMTP_CONFIG_ENCRYPTION_KEY")),
  paymentKeyFingerprint: fingerprint(firstValue("PAYMENT_CONFIG_ENCRYPTION_KEY")),
  publicSiteUrl: firstValue("PUBLIC_SITE_URL") || null,
};

process.stdout.write(`JLL_ENV_AUDIT=${JSON.stringify(result)}\n`);
