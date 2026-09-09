# Student Record System — Remote MCP Server

Wraps your Spring Boot `StudentController` REST API as **MCP tools**, deployed
publicly so Claude on **web, mobile, and desktop** can add/list/update/delete
students just by chatting.

Tools exposed: `list_students`, `get_student`, `add_student`, `update_student`, `delete_student`.

## Why "remote"?
Claude's mobile and web apps only connect to MCP servers reachable over the
public internet — not to anything running on your own laptop. So both pieces
(backend + this MCP server) need to be deployed somewhere public. Railway
works well here since it can host the Node server, the Java backend, and a
MySQL database all in one project.

## 1. Deploy on Railway
1. Push this whole `student-record-system` folder (backend + student-mcp-server)
   to a GitHub repo.
2. On [railway.app](https://railway.app), create a **New Project**.
3. **Add MySQL**: "+ New" → "Database" → "MySQL". Railway gives you connection
   env vars (`MYSQLHOST`, `MYSQLPORT`, `MYSQLDATABASE`, `MYSQLUSER`, `MYSQLPASSWORD`).
4. **Deploy the backend**: "+ New" → "GitHub Repo" → select this repo, set the
   root/build path to `backend`. Railway detects the `Dockerfile` automatically.
   Set these environment variables on the backend service:
   - `DATASOURCE_URL` = `jdbc:mysql://${{MySQL.MYSQLHOST}}:${{MySQL.MYSQLPORT}}/${{MySQL.MYSQLDATABASE}}`
   - `DATASOURCE_USERNAME` = `${{MySQL.MYSQLUSER}}`
   - `DATASOURCE_PASSWORD` = `${{MySQL.MYSQLPASSWORD}}`
   Once deployed, Railway gives it a public URL like `https://backend-production-xxxx.up.railway.app`.
5. **Deploy the MCP server**: "+ New" → "GitHub Repo" → same repo, root path
   `student-mcp-server`. Set env vars:
   - `STUDENT_API_URL` = `https://<your-backend-url>/api/students`
   - `MCP_API_KEY` = any long random string you make up (this is your connector's password)
   Railway gives this one a public URL too, e.g. `https://mcp-production-yyyy.up.railway.app`.

## 2. Add it to Claude as a custom connector
On any Claude app (web, mobile, desktop):
1. Go to **Settings → Connectors**.
2. Tap **+ → Add custom connector**.
3. Name: `Student Record System`.
   URL: `https://<your-mcp-server-url>/mcp`
4. Open **Advanced settings** and add a request header:
   `Authorization: Bearer <the MCP_API_KEY you set above>`
5. Save and connect.

This connector is tied to your Claude account, so it now shows up the same
way on your phone, browser, and desktop app — no extra setup per device.

## 3. Use it
In any Claude chat:
- "Add a student named Ravi, email ravi@test.com, course CSE, age 21"
- "List all students"
- "Delete student with ID 3"

## Security notes
- `MCP_API_KEY` is your only gate — anyone with your MCP URL + key can edit
  the student table, so keep it secret like a password.
- The old hardcoded DB password in `application.properties` has been replaced
  with environment variables (`DATASOURCE_URL/USERNAME/PASSWORD`) — never
  commit real credentials to the repo.
- Since this is a custom (unverified) connector, Claude will show a warning
  before connecting — that's expected, it's your own server.

## Local testing (optional, before deploying)
```bash
cd student-mcp-server
npm install
STUDENT_API_URL=http://localhost:8081/api/students node index.js
```
This starts the MCP server on `http://localhost:3000/mcp` — useful to sanity
check it before pushing to Railway, though Claude itself can't reach it there.
