import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { env } from "@/lib/env";

// For serverless environments (Next.js API routes), use a connection pool with max: 1
const client = postgres(env.DATABASE_URL, { max: 1 });

export const db = drizzle(client, { schema });
