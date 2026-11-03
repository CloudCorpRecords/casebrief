/**
 * casebrief core: two tools over the CaseMargin
 * support-ticket reasoning API.
 *
 * Shared rules, as documented in the spec:
 * - The API key is read from env `CASEMARGIN_API_KEY` and
 *   is optional. When set it travels as
 *   `Authorization: Bearer <key>`; when unset the request
 *   simply carries no Authorization header (the anonymous
 *   tier) and its absence is never an error.
 * - The base URL defaults to `https://casemargin.com/api`
 *   (labelled reconstruction) and is overridable via env
 *   `CASEMARGIN_API_URL` (or the injectable deps in tests).
 * - Refusal rule (README-pinned, applied per-call here
 *   rather than at startup — a labelled deviation): when a
 *   key is configured and the base URL is a non-https
 *   origin other than loopback (`localhost`, `127.0.0.1`,
 *   `::1`), every tool fails with `refusing to send
 *   CASEMARGIN_API_KEY over a non-https origin` and makes
 *   no request. An http loopback base is allowed.
 * - Only `ticket_content` leaves the machine, as the JSON
 *   body `{"ticket_content": "..."}` of a POST.
 * - A successful call returns the upstream JSON body as
 *   text, passed through verbatim.
 * - A non-2xx upstream response fails with
 *   `casemargin error: HTTP <status>`; a throwing fetch
 *   fails with `casemargin unreachable`.
 * - Validation runs before any request, with the pinned
 *   error strings: `ticket_content must be a string of 10
 *   to 50000 characters` (generate_case_brief) and
 *   `ticket_content must be a string of 10 to 20000
 *   characters` (check_escalation_readiness). The length
 *   bounds are README-pinned.
 * - Upstream access goes through the injectable fetch in
 *   deps, so tests run against a fake fetch only.
 *
 * Wires (labelled reconstructions): `POST <base>/case-brief`
 * for generate_case_brief and
 * `POST <base>/escalation-readiness` for
 * check_escalation_readiness.
 */
import type {
  BriefDeps,
  CheckEscalationReadinessArgs,
  FetchFn,
  FetchResponseLike,
  GenerateCaseBriefArgs,
} from "./types.js";

export const VERSION = "0.1.0";

export const DEFAULT_BASE_URL = "https://casemargin.com/api";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function envOf(deps: BriefDeps): Record<string, string | undefined> {
  return deps.env ?? process.env;
}

function baseUrl(deps: BriefDeps): string {
  if (deps.baseUrl && deps.baseUrl.trim() !== "") {
    return deps.baseUrl.trim().replace(/\/+$/, "");
  }
  const raw = envOf(deps).CASEMARGIN_API_URL;
  const base = raw && raw.trim() !== "" ? raw.trim() : DEFAULT_BASE_URL;
  return base.replace(/\/+$/, "");
}

function apiKey(deps: BriefDeps): string | undefined {
  const key = deps.apiKey ?? envOf(deps).CASEMARGIN_API_KEY;
  return key ? key : undefined;
}

async function defaultFetch(
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<FetchResponseLike> {
  return fetch(url, init);
}

function fetchFn(deps: BriefDeps): FetchFn {
  return deps.fetchFn ?? defaultFetch;
}

/**
 * Enforce the refusal rule: a configured key must never be
 * sent to a non-https origin other than loopback.
 */
function assertKeyTransport(base: string, key: string | undefined): void {
  if (!key) return;
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return;
  }
  if (url.protocol === "https:") return;
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (LOOPBACK_HOSTS.has(host)) return;
  throw new Error("refusing to send CASEMARGIN_API_KEY over a non-https origin");
}

/** Validate ticket_content against its pinned length bounds. */
function requireTicketContent(value: unknown, max: number, message: string): string {
  if (typeof value !== "string" || value.length < 10 || value.length > max) {
    throw new Error(message);
  }
  return value;
}

/** Run one POST against the API and return the body text verbatim. */
async function callApi(deps: BriefDeps, path: string, ticketContent: string): Promise<string> {
  const base = baseUrl(deps);
  const key = apiKey(deps);
  assertKeyTransport(base, key);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key) headers.Authorization = `Bearer ${key}`;
  let res: FetchResponseLike;
  try {
    res = await fetchFn(deps)(`${base}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ticket_content: ticketContent }),
    });
  } catch {
    throw new Error("casemargin unreachable");
  }
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`casemargin error: HTTP ${res.status}`);
  }
  return res.text();
}

/* ------------------------------------------------------------------ */
/* Tools                                                               */
/* ------------------------------------------------------------------ */

/**
 * Structured case brief from a support ticket thread.
 * Wire (labelled reconstruction): POST <base>/case-brief.
 */
export async function generateCaseBrief(
  args: GenerateCaseBriefArgs,
  deps: BriefDeps = {},
): Promise<string> {
  const a = (args ?? {}) as unknown as Record<string, unknown>;
  const ticketContent = requireTicketContent(
    a.ticket_content,
    50000,
    "ticket_content must be a string of 10 to 50000 characters",
  );
  return callApi(deps, "/case-brief", ticketContent);
}

/**
 * L2 escalation-readiness score for a support ticket.
 * Wire (labelled reconstruction): POST <base>/escalation-readiness.
 */
export async function checkEscalationReadiness(
  args: CheckEscalationReadinessArgs,
  deps: BriefDeps = {},
): Promise<string> {
  const a = (args ?? {}) as unknown as Record<string, unknown>;
  const ticketContent = requireTicketContent(
    a.ticket_content,
    20000,
    "ticket_content must be a string of 10 to 20000 characters",
  );
  return callApi(deps, "/escalation-readiness", ticketContent);
}
