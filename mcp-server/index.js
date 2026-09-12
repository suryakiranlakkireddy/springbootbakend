import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const API_BASE = process.env.STUDENT_API_BASE || "https://springbootbakend.onrender.com/api/students";
const BACKEND_ROOT = API_BASE.replace(/\/api\/students\/?$/, "");
// Backend can be cold-starting (Render free tier) AND the DB pooler can be
// slow to hand back a connection. Give it real time to wake up, but never
// hang forever - fail fast with a clear error instead of stalling the caller.
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 45000);

function log(level, msg, meta = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta }));
}

async function apiFetch(path, options = {}) {
  const url = path ? `${API_BASE}/${path}` : API_BASE;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
    const text = await res.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    log("info", "backend_call", { url, method: options.method || "GET", status: res.status, durationMs: Date.now() - start });
    if (!res.ok) {
      throw new Error(`Student API error ${res.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
    }
    return body;
  } catch (err) {
    const durationMs = Date.now() - start;
    if (err.name === "AbortError") {
      log("error", "backend_call_timeout", { url, method: options.method || "GET", durationMs, timeoutMs: FETCH_TIMEOUT_MS });
      throw new Error(
        `The backend took longer than ${FETCH_TIMEOUT_MS / 1000}s to respond (it may be cold-starting or the database connection is stuck). Please try again in a moment.`
      );
    }
    log("error", "backend_call_failed", { url, method: options.method || "GET", durationMs, error: err.message });
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function textResult(data) {
  return { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] };
}

function errorResult(err) {
  return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
}

function buildServer() {
  const server = new McpServer({ name: "student-record-mcp", version: "1.0.0" });

  server.registerTool(
    "list_students",
    { title: "List students", description: "Get all students in the Student Record System.", inputSchema: {} },
    async () => {
      try {
        return textResult(await apiFetch(""));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "get_student",
    {
      title: "Get student by ID",
      description: "Get a single student's details by their numeric ID.",
      inputSchema: { id: z.number().int().describe("The student's numeric ID") },
    },
    async ({ id }) => {
      try {
        return textResult(await apiFetch(`${id}`));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "create_student",
    {
      title: "Create student",
      description: "Add a new student to the Student Record System.",
      inputSchema: {
        name: z.string().describe("Full name of the student"),
        email: z.string().describe("Student's email address"),
        course: z.string().describe("Course the student is enrolled in"),
        age: z.number().int().describe("Student's age"),
      },
    },
    async ({ name, email, course, age }) => {
      try {
        return textResult(await apiFetch("", { method: "POST", body: JSON.stringify({ name, email, course, age }) }));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "update_student",
    {
      title: "Update student",
      description: "Update an existing student's details by ID.",
      inputSchema: {
        id: z.number().int().describe("The student's numeric ID"),
        name: z.string().describe("Full name of the student"),
        email: z.string().describe("Student's email address"),
        course: z.string().describe("Course the student is enrolled in"),
        age: z.number().int().describe("Student's age"),
      },
    },
    async ({ id, name, email, course, age }) => {
      try {
        return textResult(await apiFetch(`${id}`, { method: "PUT", body: JSON.stringify({ name, email, course, age }) }));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "delete_student",
    {
      title: "Delete student",
      description: "Delete a student from the Student Record System by ID.",
      inputSchema: { id: z.number().int().describe("The student's numeric ID") },
    },
    async ({ id }) => {
      try {
        await apiFetch(`${id}`, { method: "DELETE" });
        return textResult(`Student ${id} deleted.`);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  return server;
}

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => log("info", "http_request", { method: req.method, path: req.path, status: res.statusCode, durationMs: Date.now() - start }));
  next();
});

app.post("/mcp", async (req, res) => {
  try {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    log("error", "mcp_request_error", { error: err.message, stack: err.stack });
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  }
});

app.get("/mcp", (req, res) => {
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
});
app.delete("/mcp", (req, res) => {
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
});

app.get("/", (req, res) => res.send("Student Record MCP server is running. POST to /mcp."));

// Reports MCP-server liveness AND whether the backend it depends on is reachable,
// with its own short timeout, so a hung backend/DB shows up here instead of
// silently manifesting only as a tool-call timeout later.
app.get("/health", async (req, res) => {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetch(`${BACKEND_ROOT}/health`, { signal: controller.signal });
    const backend = await r.json().catch(() => ({ status: r.ok ? "UP" : "DOWN" }));
    clearTimeout(timer);
    res.status(r.ok ? 200 : 503).json({ status: "UP", backend, checkedMs: Date.now() - start });
  } catch (err) {
    clearTimeout(timer);
    res.status(503).json({ status: "UP", backend: { status: "DOWN", error: err.message }, checkedMs: Date.now() - start });
  }
});

// Global error handler - guarantees every request gets a response, even on
// an uncaught synchronous error in a route.
app.use((err, req, res, next) => {
  log("error", "unhandled_express_error", { error: err.message, stack: err.stack });
  if (!res.headersSent) {
    res.status(500).json({ error: "Internal server error" });
  }
});

process.on("unhandledRejection", (reason) => {
  log("error", "unhandled_rejection", { reason: String(reason) });
});
process.on("uncaughtException", (err) => {
  log("error", "uncaught_exception", { error: err.message, stack: err.stack });
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => log("info", "server_started", { port: PORT }));

function shutdown(signal) {
  log("info", "shutdown_start", { signal });
  server.close(() => {
    log("info", "shutdown_complete");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
