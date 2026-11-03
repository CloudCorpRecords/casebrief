#!/usr/bin/env node
/**
 * casebrief CLI.
 *
 *   casebrief generate_case_brief '<json>'
 *   casebrief check_escalation_readiness '<json>'
 *   casebrief mcp
 *   casebrief --version
 *
 * Each tool subcommand takes one JSON argument string with the
 * tool's arguments and prints the tool's result text. Exit
 * codes: 0 success, 1 runtime error, 2 usage error.
 */
import {
  checkEscalationReadiness,
  generateCaseBrief,
  VERSION,
} from "./brief.js";

const TOOL_NAMES = [
  "generate_case_brief",
  "check_escalation_readiness",
] as const;

function usage(): never {
  console.error(`Usage:
  casebrief <tool> '<json-args>'     one of: ${TOOL_NAMES.join(", ")}
  casebrief mcp
  casebrief --version`);
  process.exit(2);
}

async function runTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "generate_case_brief":
      return generateCaseBrief(args as never);
    case "check_escalation_readiness":
      return checkEscalationReadiness(args as never);
    default:
      usage();
  }
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    return;
  }
  if (cmd === "mcp") {
    if (rest.length !== 0) usage();
    await import("./mcp.js");
    return;
  }
  if (!(TOOL_NAMES as readonly string[]).includes(cmd ?? "")) usage();
  if (rest.length > 1) usage();
  let args: Record<string, unknown> = {};
  if (rest.length === 1) {
    try {
      const parsed: unknown = JSON.parse(rest[0]);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) usage();
      args = parsed as Record<string, unknown>;
    } catch {
      console.error("error: argument must be a JSON object string");
      process.exit(2);
    }
  }
  try {
    const out = await runTool(cmd, args);
    console.log(out);
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

void main();
