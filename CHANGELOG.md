# Changelog

## 0.1.0 (2026-10-27)

- Initial release: two MCP tools and matching CLI subcommands
  for support-ticket reasoning over the CaseMargin API —
  `generate_case_brief` and `check_escalation_readiness`.
- The API key is optional (`CASEMARGIN_API_KEY`, sent as a
  Bearer token when set; base URL via `CASEMARGIN_API_URL`)
  and only `ticket_content` is sent upstream; upstream JSON
  is returned verbatim and validation, refusal and upstream
  failures use the documented error strings.
