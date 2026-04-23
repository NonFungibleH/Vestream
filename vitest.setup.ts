// vitest.setup.ts
// Runs once BEFORE any test file is imported. Use this for things that must
// exist as env vars at module-eval time — e.g. subgraph URLs that are
// composed from GRAPH_API_KEY in a top-level const in each adapter file.
//
// Real values never land here — we just need the URLs to resolve to something
// truthy so adapter tests can mock the actual fetch response.
process.env.GRAPH_API_KEY    ??= "test-graph-api-key-for-vitest";
process.env.DATABASE_URL     ??= "postgres://test:test@localhost:5432/test";
process.env.SESSION_SECRET   ??= "vitest_only_placeholder_secret_at_least_32_characters_long";
// NODE_ENV is set to "test" by Vitest itself; don't reassign it (TS types it as readonly).
