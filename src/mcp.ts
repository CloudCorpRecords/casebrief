/**
 * casebrief MCP server. Tools: generate_case_brief,
 * check_escalation_readiness.
 *
 * Why the low-level Server instead of McpServer: the
 * high-level helper converts zod schemas to JSON Schema and
 * injects keys that are not in this tool set's documented
 * spec ("$schema" and "additionalProperties"), which breaks
 * exact tool-list/schema parity with the spec. This file
 * serves tools/list with the spec's exact input schemas as
 * explicit literals, and the core validates every tools/call
 * argument set itself.
 *
 * Every tool returns a single text item carrying the upstream
 * JSON verbatim; validation, refusal and upstream failures
 * come back as isError results carrying the documented error
 * strings.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import {
  checkEscalationReadiness,
  generateCaseBrief,
  VERSION,
} from "./brief.js";

const TOOLS = [
  {
    name: "generate_case_brief",
    description:
      "Generate a structured case brief from a support ticket thread: a quick-scan assessment and next step, the current problem, actions taken with outcomes, and key context.",
    inputSchema: {
      type: "object" as const,
      properties: {
        ticket_content: { maxLength: 50000, minLength: 10, type: "string" , description: "The ticket content for this call." },
      },
      required: ["ticket_content"],
    },
  },
  {
    name: "check_escalation_readiness",
    description:
      "Score whether a support ticket is ready to escalate to L2: an overall 0–100 score, a dimensional breakdown, predicted L2 questions, and missing items.",
    inputSchema: {
      type: "object" as const,
      properties: {
        ticket_content: { maxLength: 20000, minLength: 10, type: "string" , description: "The ticket content for this call." },
      },
      required: ["ticket_content"],
    },
  },
];

function textResult(text: string) {
  return {
    content: [{ type: "text" as const, text }],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "casebrief", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;
  try {
    let out: string;
    switch (name) {
      case "generate_case_brief":
        out = await generateCaseBrief(a as never);
        break;
      case "check_escalation_readiness":
        out = await checkEscalationReadiness(a as never);
        break;
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(out);
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
