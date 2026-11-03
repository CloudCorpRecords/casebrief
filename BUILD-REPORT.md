# casebrief — Build Report (Batch 23)

Rebuild of the `casemargin-mcp-server` MCP server (npm
v1.0.2; registry record
`com.casemargin/casemargin-mcp-server`) from the firsthand
spec in `specs-batch23/casebrief.md`. Built 2026-10-27.

## Identity

- npm: `@reneturcios/casebrief` @ 0.1.0, bin `casebrief` →
  `dist/cli.js`
- MCP Registry name: `io.github.CloudCorpRecords/casebrief`
  (matches `package.json` `mcpName`, `server.json` `name`,
  and the Dockerfile `io.modelcontextprotocol.server.name`
  label)
- server.json description (94 chars, verified):
  "Support-ticket reasoning: structured case briefs and L2
  escalation-readiness scores from text."
- server.json: npm package entry carries `"version":
  "0.1.0"`; the OCI entry
  (`ghcr.io/cloudcorprecords/casebrief:0.1.0`) carries
  **no** `version` field (verified).

## Files (19-file factory set, per TEMPLATE.md §2)

package.json, server.json, Dockerfile, tsconfig.json
(byte-identical to builds/geodata/tsconfig.json, verified
with `cmp`), .gitignore, package-lock.json, README.md
(fresh prose), LICENSE (MIT, © 2026 Rene Turcios),
CHANGELOG.md (single 0.1.0 entry dated 2026-10-27),
src/index.ts, src/cli.ts, src/mcp.ts, src/types.ts,
src/brief.ts (core), test/brief.test.ts, and the four
workflows under .github/workflows/ (publish-container
adapted: IMAGE ghcr.io/cloudcorprecords/casebrief, smoke
assertion on server name `casebrief`). Plus this
BUILD-REPORT.md and the parity-out/ artifacts. The parity
fixture lives at
`harness/fixtures/casemargin-mcp-server-tools-original.json`
with the spec's exact `_source` string.

## Implementation

- `src/mcp.ts`: low-level `Server` API
  (`sdk/server/index.js` + `StdioServerTransport`,
  handlers for `ListToolsRequestSchema` /
  `CallToolRequestSchema` from `sdk/types.js`), explicit
  JSON-schema literals for both tools
  (generate_case_brief, check_escalation_readiness); no
  McpServer/zod registration. Tool descriptions and input
  schemas are the fixture's, exactly — `ticket_content`
  carries `minLength`/`maxLength` 10/50000
  (generate_case_brief) and 10/20000
  (check_escalation_readiness), and neither schema carries
  `additionalProperties`.
- `src/brief.ts`: `VERSION = "0.1.0"`. All upstream access
  goes through an injectable fetch (deps `fetchFn`, `env`,
  `apiKey`, `baseUrl`). The key from `CASEMARGIN_API_KEY`
  is optional: when set it is sent as
  `Authorization: Bearer <key>`; when unset the request
  carries no Authorization header and that is never an
  error. Base URL defaults to
  `https://casemargin.com/api`, overridable via
  `CASEMARGIN_API_URL`. Only `ticket_content` leaves the
  machine, as the JSON body of a POST. Success returns the
  upstream body text verbatim. Non-2xx →
  `casemargin error: HTTP <status>`; a throwing fetch →
  `casemargin unreachable`. Validation runs before any
  request, with the pinned strings
  `ticket_content must be a string of 10 to 50000
  characters` and `ticket_content must be a string of 10
  to 20000 characters`.
- Refusal rule (README-pinned): when a key is configured
  and the base URL is a non-https origin other than
  loopback (`localhost`, `127.0.0.1`, `::1`), every tool
  fails with `refusing to send CASEMARGIN_API_KEY over a
  non-https origin` and makes no request. An http loopback
  base is allowed, and an http public base without a key
  is allowed (nothing to protect).
- CLI: one subcommand per tool taking a JSON argument
  string, `mcp`, `--version` (prints `0.1.0`); unknown
  subcommand → usage on stderr, exit 2; isError results
  exit 1 (validation and refusal paths both spot-checked
  against the built CLI).

## Endpoint provenance (pinned vs reconstructed)

README-pinned:

- The 2 tools, their inputs (incl. the 10–50,000 /
  10–20,000 character bounds) and documented output
  shapes.
- `CASEMARGIN_API_KEY` optional, sent as a request header;
  `CASEMARGIN_API_URL` env name; the non-https-origin
  refusal rule; only `ticket_content` leaves the machine.

Labelled reconstructions (also labelled in README.md):

- Default base URL `https://casemargin.com/api`.
- `POST <base>/case-brief` with body
  `{"ticket_content": "..."}` — `generate_case_brief`.
- `POST <base>/escalation-readiness` with the same body
  shape — `check_escalation_readiness`.

## Verification (all real, run 2026-10-27)

- `npm run build` (tsc): exit 0.
- `npm test`: **31 tests, 31 pass, 0 fail** — fake fetch
  and injected env only, no live network (the CLI tests
  spawn the CLI through tsx and exercise only paths that
  fail before any request). Covers both wires (POST URL,
  body shape, Content-Type), the Bearer header present
  with a key and absent without, env key/base handling,
  verbatim passthrough of both documented output shapes
  (including a non-canonical JSON string), both length
  bounds (below-min, above-max, missing, non-string, exact
  bounds accepted, and a 30,000-char input that fits the
  brief bound but not the escalation bound — each with no
  request made), the refusal rule (https base fine; http
  public base + key → refusal with no request, for both
  tools; http loopback `localhost` / `127.0.0.1` / `[::1]`
  + key → allowed; http public base without a key →
  allowed), the HTTP-error and unreachable mappings, and
  the CLI cases (`--version` exit 0, unknown subcommand /
  non-JSON argument / extra arguments exit 2, validation
  and refusal exit 1).
- `node dist/cli.js --version`: prints `0.1.0`.
  Unknown subcommand exits 2 with usage; a validation
  failure and a refusal each exit 1.
- Parity: `harness/parity.py` against
  `harness/fixtures/casemargin-mcp-server-tools-original.json`
  → **PASS, parity 100.0, identical_tools 2 / total 2**
  (see `parity-out/parity.json`).
- Lockfile (Route 3, clean from birth): generated in a
  temp dir containing only `package.json` with
  `npm install --package-lock-only --ignore-scripts
  --offline`; verified it parses, `name` ==
  `@reneturcios/casebrief`, **128 package entries**;
  copied in as `package-lock.json`, then
  `npm install --offline --ignore-scripts` in the build
  dir succeeded for node_modules.
- Version consistency: `package.json` 0.1.0 =
  `server.json` top-level 0.1.0 = npm entry 0.1.0 = OCI
  tag `:0.1.0` = core `VERSION` 0.1.0 = CHANGELOG heading
  `## 0.1.0 (2026-10-27)`.

## Gaps

- Live upstream behaviour is unproven: no live call was
  made (tests are fake-fetch only).
- The default base URL and both endpoint paths are
  labelled reconstructions — the original README pins the
  env names, header auth, bounds and refusal rule but not
  the paths or the default base.
- Labelled deviation: the original refuses to start when
  the base URL breaks the https rule; this rebuild applies
  the refusal per call (every tool returns the refusal as
  an isError result) so the server still starts.
