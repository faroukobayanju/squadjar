import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

try {
  process.loadEnvFile(".env.local");
} catch {}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (.env.local)");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);
// One statement per request: split the idempotent schema on semicolons.
for (const stmt of readFileSync("db/schema.sql", "utf8").split(";").map((s) => s.trim()).filter(Boolean)) await sql.query(stmt);
console.log("migrated");
