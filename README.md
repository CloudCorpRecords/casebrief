# casebrief

Turn a long, messy support ticket thread into something a
human can act on. casebrief is a small client for the
CaseMargin ticket-reasoning service: hand it the raw text
of a ticket and it hands back either a structured brief of
the case — what the problem is, what has already been tried
and what happened, and the context that matters — or a
readiness score that says whether the ticket is complete
enough to escalate to L2, and what is still missing if it
is not.

Only the ticket text you pass in ever leaves the machine.
Responses come back exactly as the service returned them:
nothing is trimmed, renamed or summarised on the way
through.

## Configuration

Two environment variables control the client:

- `CASEMARGIN_API_KEY` (optional) — when set, it is sent on
  every request as `Authorization: Bearer <key>`. Leaving
  it unset is not an error: brief generation then runs on
  the anonymous per-IP tier and the escalation check is
  free.
- `CASEMARGIN_API_URL` (optional) — API base URL. Defaults
  to `https://casemargin.com/api` (a reconstruction; see
  "Endpoint provenance" below).

One safety rule governs the key: if the base URL is a
non-`https` origin other than loopback (`localhost`,
`127.0.0.1`, `::1`) while a key is configured, every tool
refuses with `refusing to send CASEMARGIN_API_KEY over a
non-https origin` and no request is made, so the key is
never sent in cleartext. An `http` loopback base — a local
development server, say — is allowed. In this rebuild the
check runs per call rather than at startup, so the server
itself still starts; that is a deliberate, labelled
deviation from the original.

## Tools

- `generate_case_brief` — a structured brief from a ticket
  thread: `quick_scan` (an assessment, the next step and a
  status), `full_brief` (the current problem, the actions
  taken with their outcomes, and key context) and
  `metadata` (input length, brief length and the
  compression ratio). `ticket_content` must be a string of
  10 to 50,000 characters.
- `check_escalation_readiness` — whether the ticket is
  ready for L2: an `overall_score` from 0 to 100, a
  `readiness` verdict, five scored `dimensions`
  (problem clarity, troubleshooting evidence, business
  impact, next action and billing defensibility, each with
  a score and a note), the questions L2 is likely to ask
  (`predicted_l2_questions`) and what the ticket still
  lacks (`missing_items`). `ticket_content` must be a
  string of 10 to 20,000 characters.

Length validation happens before any request and fails
with `ticket_content must be a string of 10 to 50000
characters` or `ticket_content must be a string of 10 to
20000 characters`, depending on the tool. An upstream
non-2xx reply fails with `casemargin error: HTTP
<status>` and an unreachable API with `casemargin
unreachable`.

### Endpoint provenance

The README for the original service pins the environment
variable names, the header-based key, the length bounds
and the refusal rule above, but it does not pin the
default base URL or the two request paths. Those three
pieces are reconstructions, labelled as such:

- Default base `https://casemargin.com/api` —
  reconstruction.
- `POST <base>/case-brief` with JSON body
  `{"ticket_content": "..."}` — reconstruction (used by
  `generate_case_brief`).
- `POST <base>/escalation-readiness` with the same body
  shape — reconstruction (used by
  `check_escalation_readiness`).

## CLI

Each tool is a subcommand taking one JSON argument string:

```bash
npx @reneturcios/casebrief generate_case_brief '{"ticket_content":"Customer reports the export fails since Tuesday..."}'
npx @reneturcios/casebrief check_escalation_readiness '{"ticket_content":"Customer reports the export fails since Tuesday..."}'
npx @reneturcios/casebrief --version
```

Output is the tool's result text (the upstream JSON on
success). Exit codes: `0` on success, `1` on a runtime
error (including a validation, refusal or upstream
failure), `2` on a usage error.

## MCP server

```bash
npx -y @reneturcios/casebrief mcp
```

MCP client config (the key is optional; provide it through
the client's environment when you have one):

```json
{
  "mcpServers": {
    "casebrief": {
      "command": "npx",
      "args": ["-y", "@reneturcios/casebrief", "mcp"],
      "env": {
        "CASEMARGIN_API_KEY": "<your key>"
      }
    }
  }
}
```

## Docker

```bash
docker run -i ghcr.io/cloudcorprecords/casebrief
docker run --rm ghcr.io/cloudcorprecords/casebrief generate_case_brief '{"ticket_content":"Customer reports the export fails since Tuesday..."}'
```

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # tsx --test test/*.test.ts (fake fetch only, no network)
npm run dev     # run the CLI from source
```

## License

MIT — Copyright (c) 2026 Rene Turcios
