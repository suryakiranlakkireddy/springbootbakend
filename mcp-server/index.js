import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const API_BASE = process.env.STUDENT_API_BASE || "https://springbootbakend.onrender.com/api/students";

async function apiFetch(path, options = {}) {
  const url = path ? `${API_BASE}/${path}` : API_BASE;
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`Student API error ${res.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
  }
  return body;
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
    {
      title: "List students",
      description: "Get all students in the Student Record System.",
      inputSchema: {},
    },
    async () => {
      try {
        const data = await apiFetch("");
        return textResult(data);
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
        const data = await apiFetch(`${id}`);
        return textResult(data);
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
        const data = await apiFetch("", {
          method: "POST",
          body: JSON.stringify({ name, email, course, age }),
        });
        return textResult(data);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "update_student",
    {
      title: "Update student",
      description: "Update an existing student's details by ID. Only send fields you want to change; unspecified fields are left as-is by resending current values.",
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
        const data = await apiFetch(`${id}`, {
          method: "PUT",
          body: JSON.stringify({ name, email, course, age }),
        });
        return textResult(data);
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
    console.error("MCP request error:", err);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  }
});

// Stateless server: reject GET (SSE stream) and DELETE (session close) per MCP streamable-http spec
app.get("/mcp", (req, res) => {
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
});
app.delete("/mcp", (req, res) => {
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
});

app.get("/", (req, res) => res.send("Student Record MCP server is running. POST to /mcp."));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Student MCP server listening on port ${PORT}`));
