import { PrivyClient } from "@privy-io/node";
import { isAddress, type Address } from "viem";
import { hasDb } from "./db";

const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const appSecret = process.env.PRIVY_APP_SECRET;
export const configured = hasDb && !!appId && !!appSecret;

const json = (body: unknown, status: number) => Response.json(body, { status });
const unauthorized = () => json({ error: "unauthorized" }, 401);

let client: PrivyClient | undefined;

/** Verifies the bearer Privy access token and resolves the user's embedded account. Throws a 401 Response. */
export async function requireUser(req: Request): Promise<{ privyId: string; address: Address; email?: string }> {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token || !appId || !appSecret) throw unauthorized();
  try {
    client ??= new PrivyClient({ appId, appSecret });
    const { user_id } = await client.utils().auth().verifyAccessToken(token);
    const user = await client.users()._get(user_id);
    const accounts = user.linked_accounts as { type: string; address?: string; email?: string; wallet_client_type?: string; chain_type?: string }[];
    const wallet = accounts.find((a) => a.type === "wallet" && a.wallet_client_type === "privy" && a.chain_type === "ethereum");
    if (!wallet?.address || !isAddress(wallet.address)) throw unauthorized();
    const email = accounts.find((a) => a.type === "email")?.address ?? accounts.find((a) => a.type === "google_oauth")?.email;
    return { privyId: user_id, address: wallet.address.toLowerCase() as Address, email };
  } catch (e) {
    throw e instanceof Response ? e : unauthorized();
  }
}

/** Wraps a route handler: 503 when not configured, thrown Responses pass through, anything else is a 500. */
export function route<A extends unknown[]>(fn: (...a: A) => Promise<Response>) {
  return async (...a: A): Promise<Response> => {
    if (!configured) return json({ error: "not configured" }, 503);
    try {
      return await fn(...a);
    } catch (e) {
      return e instanceof Response ? e : json({ error: "server error" }, 500);
    }
  };
}

export const bad = (error = "bad request", status = 400) => json({ error }, status);
