import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { basename, dirname, isAbsolute, join } from "node:path";
import { mkdirSync } from "node:fs";

function databasePath() {
  const configured = process.env.DATABASE_URL ?? "file:./data/social-lab.sqlite";
  const value = configured.startsWith("file:") ? configured.slice(5) : configured;
  return isAbsolute(value)
    ? value
    : join(process.cwd(), "data", basename(value));
}

const path = databasePath();
mkdirSync(dirname(path), { recursive: true });

const sqlite = new Database(path);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS user (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT,
    email TEXT UNIQUE,
    emailVerified INTEGER,
    image TEXT
  );

  CREATE TABLE IF NOT EXISTS account (
    userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    provider TEXT NOT NULL,
    providerAccountId TEXT NOT NULL,
    refresh_token TEXT,
    access_token TEXT,
    expires_at INTEGER,
    token_type TEXT,
    scope TEXT,
    id_token TEXT,
    session_state TEXT,
    PRIMARY KEY (provider, providerAccountId)
  );

  CREATE TABLE IF NOT EXISTS session (
    sessionToken TEXT PRIMARY KEY NOT NULL,
    userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    expires INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS verificationToken (
    identifier TEXT NOT NULL,
    token TEXT NOT NULL,
    expires INTEGER NOT NULL,
    PRIMARY KEY (identifier, token)
  );

  CREATE TABLE IF NOT EXISTS authenticator (
    credentialID TEXT NOT NULL UNIQUE,
    userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    providerAccountId TEXT NOT NULL,
    credentialPublicKey TEXT NOT NULL,
    counter INTEGER NOT NULL,
    credentialDeviceType TEXT NOT NULL,
    credentialBackedUp INTEGER NOT NULL,
    transports TEXT,
    PRIMARY KEY (userId, credentialID)
  );

  CREATE TABLE IF NOT EXISTS magicLinkRequest (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identifier TEXT NOT NULL,
    ipHash TEXT NOT NULL,
    createdAt INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS magicLinkRequest_identifier_createdAt
    ON magicLinkRequest(identifier, createdAt);
  CREATE INDEX IF NOT EXISTS magicLinkRequest_ipHash_createdAt
    ON magicLinkRequest(ipHash, createdAt);

  CREATE TABLE IF NOT EXISTS submissionRequest (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identifier TEXT NOT NULL,
    createdAt INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS submissionRequest_identifier_createdAt
    ON submissionRequest(identifier, createdAt);
`);

const startupTime = Date.now();
sqlite.prepare("DELETE FROM verificationToken WHERE expires < ?").run(startupTime);
sqlite.prepare("DELETE FROM session WHERE expires < ?").run(startupTime);
sqlite
  .prepare("DELETE FROM magicLinkRequest WHERE createdAt < ?")
  .run(startupTime - 24 * 60 * 60 * 1000);
sqlite
  .prepare("DELETE FROM submissionRequest WHERE createdAt < ?")
  .run(startupTime - 24 * 60 * 60 * 1000);

export const db = drizzle(sqlite);
export { sqlite };
