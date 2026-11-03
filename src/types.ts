/**
 * casebrief types.
 *
 * Two tools wrapping the CaseMargin support-ticket
 * reasoning API. Every tool answers with the upstream JSON
 * body passed through unchanged, as a single string;
 * failures are Errors carrying the pinned error strings.
 */

export interface GenerateCaseBriefArgs {
  ticket_content: string;
}

export interface CheckEscalationReadinessArgs {
  ticket_content: string;
}

/** The minimal slice of a fetch Response this client relies on. */
export interface FetchResponseLike {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

/** Injectable fetch, so tests never touch the live network. */
export type FetchFn = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<FetchResponseLike>;

/** Runtime dependencies for the core, all injectable in tests. */
export interface BriefDeps {
  /** Fetch implementation. Defaults to the global fetch. */
  fetchFn?: FetchFn;
  /** Environment (CASEMARGIN_API_KEY / CASEMARGIN_API_URL). Defaults to process.env. */
  env?: Record<string, string | undefined>;
  /** API key override. Defaults to env CASEMARGIN_API_KEY. */
  apiKey?: string;
  /** Base URL override. Defaults to env CASEMARGIN_API_URL or the default base. */
  baseUrl?: string;
}
