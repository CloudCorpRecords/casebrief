import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkEscalationReadiness, generateCaseBrief } from "../src/brief.js";
import type { BriefDeps, FetchFn } from "../src/types.js";

/**
 * Every test runs against an injected fake fetch and an
 * injected env: no live network, no live call is made.
 * The CLI tests spawn the real CLI through tsx and only
 * exercise paths that fail before any request (version,
 * usage, validation, refusal).
 */

type Captured = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

function makeFetch(
  handler: (url: string) => { status?: number; body: unknown },
  captured: Captured[] = [],
): FetchFn {
  return async (url, init) => {
    captured.push({ url, method: init?.method, headers: init?.headers, body: init?.body });
    const r = handler(url);
    const status = r.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (typeof r.body === "string" ? r.body : JSON.stringify(r.body)),
    };
  };
}

const okFetch = (body: unknown = { ok: true }, captured: Captured[] = []) =>
  makeFetch(() => ({ body }), captured);

const throwingFetch: FetchFn = async () => {
  throw new Error("connection refused");
};

function deps(fetchFn: FetchFn, extra: Partial<BriefDeps> = {}): BriefDeps {
  return { fetchFn, env: {}, ...extra };
}

function keyDeps(fetchFn: FetchFn, extra: Partial<BriefDeps> = {}): BriefDeps {
  return { fetchFn, env: { CASEMARGIN_API_KEY: "test-key" }, ...extra };
}

async function expectError(promise: Promise<unknown>, message: string): Promise<void> {
  await assert.rejects(promise, (err: unknown) => {
    assert.equal(err instanceof Error ? err.message : String(err), message);
    return true;
  });
}

const TICKET = "Customer reports the CSV export fails with a 500 error since Tuesday.";

const BRIEF_BODY = {
  quick_scan: { assessment: "Export pipeline broken", next_step: "Check job logs", status: "open" },
  full_brief: {
    current_problem: "CSV export returns HTTP 500",
    actions_taken: ["Retried export", "Cleared cache"],
    key_context: "Started after the Tuesday deploy",
  },
  metadata: { input_length: 71, brief_length: 40, compression_ratio: 0.56 },
};

const READINESS_BODY = {
  overall_score: 72,
  readiness: "needs_work",
  dimensions: {
    problem_clarity: { score: 80, note: "Clear symptom" },
    troubleshooting_evidence: { score: 60, note: "Logs missing" },
    business_impact: { score: 75, note: "Export blocked" },
    next_action: { score: 70, note: "Owner named" },
    billing_defensibility: { score: 65, note: "Plan unclear" },
  },
  predicted_l2_questions: ["Which deploy changed the exporter?"],
  missing_items: ["Server logs for the failing window"],
};

describe("generate_case_brief (labelled reconstruction wire)", () => {
  it("POSTs {ticket_content} to <base>/case-brief and returns the body verbatim", async () => {
    const captured: Captured[] = [];
    const out = await generateCaseBrief({ ticket_content: TICKET }, deps(okFetch(BRIEF_BODY, captured)));
    assert.equal(out, JSON.stringify(BRIEF_BODY));
    assert.equal(captured.length, 1);
    assert.equal(captured[0].url, "https://casemargin.com/api/case-brief");
    assert.equal(captured[0].method, "POST");
    assert.deepEqual(JSON.parse(captured[0].body ?? ""), { ticket_content: TICKET });
    assert.equal(captured[0].headers?.["Content-Type"], "application/json");
  });

  it("sends Authorization: Bearer <key> when a key is set", async () => {
    const captured: Captured[] = [];
    await generateCaseBrief({ ticket_content: TICKET }, keyDeps(okFetch({}, captured)));
    assert.equal(captured[0].headers?.Authorization, "Bearer test-key");
  });

  it("sends no Authorization header when no key is set", async () => {
    const captured: Captured[] = [];
    await generateCaseBrief({ ticket_content: TICKET }, deps(okFetch({}, captured)));
    assert.equal(captured[0].headers?.Authorization, undefined);
  });

  it("reads the key and base URL from env", async () => {
    const captured: Captured[] = [];
    await generateCaseBrief(
      { ticket_content: TICKET },
      deps(okFetch({}, captured), {
        env: { CASEMARGIN_API_KEY: "env-key", CASEMARGIN_API_URL: "https://cm.example.test/v1/" },
      }),
    );
    assert.equal(captured[0].url, "https://cm.example.test/v1/case-brief");
    assert.equal(captured[0].headers?.Authorization, "Bearer env-key");
  });

  it("returns a string body verbatim, without JSON re-serialisation", async () => {
    const raw = '{ "quick_scan" :  { "status": "open" } }';
    const out = await generateCaseBrief({ ticket_content: TICKET }, deps(okFetch(raw)));
    assert.equal(out, raw);
  });

  it("accepts content exactly at the 10 and 50000 character bounds", async () => {
    const short = await generateCaseBrief({ ticket_content: "x".repeat(10) }, deps(okFetch({})));
    assert.equal(short, "{}");
    const long = await generateCaseBrief({ ticket_content: "x".repeat(50000) }, deps(okFetch({})));
    assert.equal(long, "{}");
  });

  it("rejects content below 10 characters and makes no request", async () => {
    const captured: Captured[] = [];
    await expectError(
      generateCaseBrief({ ticket_content: "too short" }, deps(okFetch({}, captured))),
      "ticket_content must be a string of 10 to 50000 characters",
    );
    assert.deepEqual(captured, []);
  });

  it("rejects content above 50000 characters and makes no request", async () => {
    const captured: Captured[] = [];
    await expectError(
      generateCaseBrief({ ticket_content: "x".repeat(50001) }, deps(okFetch({}, captured))),
      "ticket_content must be a string of 10 to 50000 characters",
    );
    assert.deepEqual(captured, []);
  });

  it("rejects a missing ticket_content", async () => {
    await expectError(
      generateCaseBrief({} as never, deps(okFetch())),
      "ticket_content must be a string of 10 to 50000 characters",
    );
  });

  it("rejects a non-string ticket_content", async () => {
    await expectError(
      generateCaseBrief({ ticket_content: 42 } as never, deps(okFetch())),
      "ticket_content must be a string of 10 to 50000 characters",
    );
  });
});

describe("check_escalation_readiness (labelled reconstruction wire)", () => {
  it("POSTs {ticket_content} to <base>/escalation-readiness and returns the body verbatim", async () => {
    const captured: Captured[] = [];
    const out = await checkEscalationReadiness(
      { ticket_content: TICKET },
      deps(okFetch(READINESS_BODY, captured)),
    );
    assert.equal(out, JSON.stringify(READINESS_BODY));
    assert.equal(captured.length, 1);
    assert.equal(captured[0].url, "https://casemargin.com/api/escalation-readiness");
    assert.equal(captured[0].method, "POST");
    assert.deepEqual(JSON.parse(captured[0].body ?? ""), { ticket_content: TICKET });
  });

  it("sends the Bearer header when a key is set and omits it when not", async () => {
    const withKey: Captured[] = [];
    await checkEscalationReadiness({ ticket_content: TICKET }, keyDeps(okFetch({}, withKey)));
    assert.equal(withKey[0].headers?.Authorization, "Bearer test-key");
    const withoutKey: Captured[] = [];
    await checkEscalationReadiness({ ticket_content: TICKET }, deps(okFetch({}, withoutKey)));
    assert.equal(withoutKey[0].headers?.Authorization, undefined);
  });

  it("accepts content exactly at the 20000 character bound", async () => {
    const out = await checkEscalationReadiness(
      { ticket_content: "x".repeat(20000) },
      deps(okFetch({})),
    );
    assert.equal(out, "{}");
  });

  it("rejects content below 10 characters and makes no request", async () => {
    const captured: Captured[] = [];
    await expectError(
      checkEscalationReadiness({ ticket_content: "short" }, deps(okFetch({}, captured))),
      "ticket_content must be a string of 10 to 20000 characters",
    );
    assert.deepEqual(captured, []);
  });

  it("rejects content above 20000 characters and makes no request", async () => {
    const captured: Captured[] = [];
    await expectError(
      checkEscalationReadiness({ ticket_content: "x".repeat(20001) }, deps(okFetch({}, captured))),
      "ticket_content must be a string of 10 to 20000 characters",
    );
    assert.deepEqual(captured, []);
  });

  it("rejects content that fits the brief bound but not the escalation bound", async () => {
    await expectError(
      checkEscalationReadiness({ ticket_content: "x".repeat(30000) }, deps(okFetch())),
      "ticket_content must be a string of 10 to 20000 characters",
    );
  });
});

describe("non-https refusal rule", () => {
  it("allows an https base with a key set", async () => {
    const captured: Captured[] = [];
    await generateCaseBrief(
      { ticket_content: TICKET },
      keyDeps(okFetch({}, captured), { baseUrl: "https://cm.example.test/api" }),
    );
    assert.equal(captured.length, 1);
  });

  it("refuses an http public base with a key set and makes no request", async () => {
    const captured: Captured[] = [];
    await expectError(
      generateCaseBrief(
        { ticket_content: TICKET },
        keyDeps(okFetch({}, captured), { baseUrl: "http://cm.example.test/api" }),
      ),
      "refusing to send CASEMARGIN_API_KEY over a non-https origin",
    );
    assert.deepEqual(captured, []);
  });

  it("refuses for check_escalation_readiness as well", async () => {
    const captured: Captured[] = [];
    await expectError(
      checkEscalationReadiness(
        { ticket_content: TICKET },
        deps(okFetch({}, captured), {
          env: { CASEMARGIN_API_KEY: "k", CASEMARGIN_API_URL: "http://10.0.0.5:9000/api" },
        }),
      ),
      "refusing to send CASEMARGIN_API_KEY over a non-https origin",
    );
    assert.deepEqual(captured, []);
  });

  it("allows an http loopback base (localhost) with a key set", async () => {
    const captured: Captured[] = [];
    await generateCaseBrief(
      { ticket_content: TICKET },
      keyDeps(okFetch({}, captured), { baseUrl: "http://localhost:8787/api" }),
    );
    assert.equal(captured.length, 1);
    assert.equal(captured[0].url, "http://localhost:8787/api/case-brief");
    assert.equal(captured[0].headers?.Authorization, "Bearer test-key");
  });

  it("allows http 127.0.0.1 and [::1] loopback bases with a key set", async () => {
    const a: Captured[] = [];
    await generateCaseBrief(
      { ticket_content: TICKET },
      keyDeps(okFetch({}, a), { baseUrl: "http://127.0.0.1:8787" }),
    );
    assert.equal(a.length, 1);
    const b: Captured[] = [];
    await checkEscalationReadiness(
      { ticket_content: TICKET },
      keyDeps(okFetch({}, b), { baseUrl: "http://[::1]:8787" }),
    );
    assert.equal(b.length, 1);
  });

  it("allows an http public base when no key is set (nothing to protect)", async () => {
    const captured: Captured[] = [];
    await generateCaseBrief(
      { ticket_content: TICKET },
      deps(okFetch({}, captured), { baseUrl: "http://cm.example.test/api" }),
    );
    assert.equal(captured.length, 1);
    assert.equal(captured[0].headers?.Authorization, undefined);
  });
});

describe("upstream errors", () => {
  it("maps a non-2xx reply to casemargin error: HTTP <status>", async () => {
    const fetchFn = makeFetch(() => ({ status: 429, body: "slow down" }));
    await expectError(
      generateCaseBrief({ ticket_content: TICKET }, deps(fetchFn)),
      "casemargin error: HTTP 429",
    );
  });

  it("maps a 500 reply to casemargin error: HTTP 500", async () => {
    const fetchFn = makeFetch(() => ({ status: 500, body: "boom" }));
    await expectError(
      checkEscalationReadiness({ ticket_content: TICKET }, deps(fetchFn)),
      "casemargin error: HTTP 500",
    );
  });

  it("maps a throwing fetch to casemargin unreachable", async () => {
    await expectError(
      generateCaseBrief({ ticket_content: TICKET }, deps(throwingFetch)),
      "casemargin unreachable",
    );
    await expectError(
      checkEscalationReadiness({ ticket_content: TICKET }, deps(throwingFetch)),
      "casemargin unreachable",
    );
  });
});

/* ------------------------------------------------------------------ */
/* CLI (spawned through tsx; only pre-request paths are exercised)     */
/* ------------------------------------------------------------------ */

function runCli(args: string[], env: Record<string, string> = {}) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  return spawnSync(join(root, "node_modules", ".bin", "tsx"), ["src/cli.ts", ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, CASEMARGIN_API_KEY: "", CASEMARGIN_API_URL: "", ...env },
  });
}

describe("casebrief CLI", () => {
  it("prints 0.1.0 for --version and exits 0", () => {
    const res = runCli(["--version"]);
    assert.equal(res.status, 0);
    assert.equal(res.stdout.trim(), "0.1.0");
  });

  it("exits 2 with usage for an unknown subcommand", () => {
    const res = runCli(["not-a-tool"]);
    assert.equal(res.status, 2);
    assert.match(res.stderr, /Usage/);
  });

  it("exits 2 for a non-JSON argument string", () => {
    const res = runCli(["generate_case_brief", "not json"]);
    assert.equal(res.status, 2);
  });

  it("exits 2 for extra arguments", () => {
    const res = runCli(["generate_case_brief", "{}", "{}"]);
    assert.equal(res.status, 2);
  });

  it("exits 1 with the validation message for too-short content", () => {
    const res = runCli(["generate_case_brief", JSON.stringify({ ticket_content: "short" })]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /ticket_content must be a string of 10 to 50000 characters/);
  });

  it("exits 1 with the refusal message for an http base with a key set", () => {
    const res = runCli(
      ["check_escalation_readiness", JSON.stringify({ ticket_content: TICKET })],
      { CASEMARGIN_API_KEY: "k", CASEMARGIN_API_URL: "http://cm.example.test/api" },
    );
    assert.equal(res.status, 1);
    assert.match(res.stderr, /refusing to send CASEMARGIN_API_KEY over a non-https origin/);
  });
});
