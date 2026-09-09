// Student Record System — Remote MCP Server
// Wraps the Spring Boot REST API (StudentController) as MCP tools, served over
// Streamable HTTP so it can be deployed publicly (Railway/Render) and added to
// Claude as a Custom Connector — works on web, desktop, AND mobile.

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

// --- Config (set these as environment variables on your host) ---
const PORT = process.env.PORT || 3000;
// Public URL of your deployed Spring Boot backend, e.g. https://student-backend.up.railway.app/api/students
const API_BASE = process.env.STUDENT_API_URL || "http://localhost:8081/api/students";
// Shared secret Claude must send as "Authorization: Bearer <MCP_API_KEY>".
// Set this in your host's env vars, then paste the same value into Claude's
// custom connector "Advanced settings" as a request header.
const MCP_API_KEY = process.env.MCP_API_KEY || "";

async function apiCall(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Backend returned ${res.status} ${res.statusText}: ${text || "no body"}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

function buildServer() {
  const server = new McpServer({
    name: "student-record-system",
    version: "1.0.0",
  });

  server.tool(
    "list_students",
    "List all students currently stored in the Student Record System.",
    {},
    async () => {
      const students = await apiCall("");
      return { content: [{ type: "text", text: JSON.stringify(students, null, 2) }] };
    }
  );

  server.tool(
    "get_student",
    "Get a single student's details by their numeric ID.",
    { id: z.number().int().describe("The student's numeric ID") },
    async ({ id }) => {
      const student = await apiCall(`/${id}`);
      return { content: [{ type: "text", text: JSON.stringify(student, null, 2) }] };
    }
  );

  server.tool(
    "add_student",
    "Add a new student to the Student Record System.",
    {
      name: z.string().describe("Full name of the student"),
      email: z.string().describe("Student's email address"),
      course: z.string().describe("Course/branch the student is enrolled in"),
      age: z.number().int().describe("Student's age"),
    },
    async ({ name, email, course, age }) => {
      const created = await apiCall("", {
        method: "POST",
        body: JSON.stringify({ name, email, course, age }),
      });
      return { content: [{ type: "text", text: `Student added:\n${JSON.stringify(created, null, 2)}` }] };
    }
  );

  server.tool(
    "update_student",
    "Update an existing student's details by ID.",
    {
      id: z.number().int().describe("The student's numeric ID"),
      name: z.string().describe("Full name of the student"),
      email: z.string().describe("Student's email address"),
      course: z.string().describe("Course/branch the student is enrolled in"),
      age: z.number().int().describe("Student's age"),
    },
    async ({ id, name, email, course, age }) => {
      const updated = await apiCall(`/${id}`, {
        method: "PUT",
        body: JSON.stringify({ name, email, course, age }),
      });
      return { content: [{ type: "text", text: `Student updated:\n${JSON.stringify(updated, null, 2)}` }] };
    }
  );

  server.tool(
    "delete_student",
    "Delete a student from the Student Record System by ID. This is permanent.",
    { id: z.number().int().describe("The student's numeric ID to delete") },
    async ({ id }) => {
      await apiCall(`/${id}`, { method: "DELETE" });
      return { content: [{ type: "text", text: `Student with ID ${id} deleted.` }] };
    }
  );

  return server;
}

const app = express();
app.use(express.json());

// Simple bearer-token check so random people on the internet can't hit your
// student database. Skipped only if you didn't set MCP_API_KEY (not recommended).
app.use((req, res, next) => {
  if (!MCP_API_KEY) return next();
  const auth = req.headers.authorization || "";
  if (auth === `Bearer ${MCP_API_KEY}`) return next();
  return res.status(401).json({ error: "Unauthorized" });
});

app.get("/", (req, res) => {
  res.send("Student Record System MCP server is running.");
});

// Stateless mode: a fresh transport + server per request is the simplest
// correct setup for a small deployment like this.
app.post("/mcp", async (req, res) => {
  try {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Student Record System MCP server listening on port ${PORT}`);
  console.log(`Backend API: ${API_BASE}`);
});
