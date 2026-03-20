# Deploy Preflight

Run this before any publish or deploy action (npm, Vercel, App Store, Chrome Web Store).

1. Run `pwd` — confirm we are in the correct project directory (`/Users/howardpearce/vestr` for the main app, `/Users/howardpearce/vestr/mcp` for the MCP package)
2. Verify package names / identifiers are consistent across all config files (e.g. `package.json` name matches npm org, `mcpName` matches registry)
3. Check auth credentials:
   - npm: run `npm whoami` and `npm token list` to confirm token is valid and has write access
   - Vercel: confirm `git remote -v` points to the correct repo (auto-deploys on push to `main`)
4. Run the build and confirm it passes with zero errors:
   - Main app: `cd /Users/howardpearce/vestr && npm run build`
   - MCP package: `cd /Users/howardpearce/vestr/mcp && npm run build`
5. For npm: run `npm publish --dry-run` and review the output before the real publish
6. Only then attempt the actual publish/submit

Do not skip any step. If any step fails, stop and fix the issue before proceeding.
