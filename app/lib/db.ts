import { neon } from "@neondatabase/serverless";

export const hasDb = !!process.env.DATABASE_URL;
// neon() does not connect until a query runs; routes check hasDb first.
export const sql = neon(process.env.DATABASE_URL ?? "postgresql://unset@localhost/unset");
