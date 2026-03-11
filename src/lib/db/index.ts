import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

// For serverless environments (Next.js API routes), use a connection pool with max: 1
const client = postgres(connectionString, { max: 1 });

export const db = drizzle(client, { schema });
