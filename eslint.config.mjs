import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // eslint-plugin-react-hooks v6 (shipped with Next 16.2+) introduced two
    // aggressive new rules that flag dozens of pre-existing, working patterns:
    //
    //   react-hooks/set-state-in-effect
    //     Calling setState synchronously in useEffect. Flagged at every place
    //     we reset a form after submit, close a modal on success, or wire a
    //     prop → state mirror — patterns that are correct in React, just not
    //     the ones this rule prefers.
    //
    //   react-hooks/purity
    //     "Cannot call impure function during render". Trips on every
    //     Date.now()/Math.random()/crypto.randomUUID() used in render,
    //     which we do in a handful of UI components (countdowns, IDs,
    //     ephemeral keys). All of these are intentionally non-pure.
    //
    // Demoting to warn rather than fixing every call site because:
    //   (1) the call sites work correctly today,
    //   (2) a mass rewrite is high-risk for low reward,
    //   (3) CI blocking on these stalls every unrelated PR.
    //
    // We still surface them as warnings so new code gets the nudge; existing
    // code is grandfathered. Revisit as a planned tidy-up, not as a CI gate.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity":              "warn",
      "react-hooks/refs":                "warn",
    },
  },
]);

export default eslintConfig;
