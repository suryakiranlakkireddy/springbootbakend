# Student Record System

## Stack
- Frontend: HTML + CSS + JavaScript
- Backend: Spring Boot 3.2 (Java 17)
- Database: MySQL
- MCP Server: Node.js (lets Claude add/list/update/delete students via chat)

## Setup

### 1. MySQL
```sql
CREATE DATABASE student_db;
```
Update `backend/src/main/resources/application.properties` with your MySQL username and password (or set env vars).

### 2. Run Backend
```bash
cd backend
mvn spring-boot:run
```
Server starts at http://localhost:8081

### 3. Open Frontend
Open `frontend/index.html` in your browser.

### 4. Connect Claude via MCP
See `student-mcp-server/README.md` for deploying the MCP server and adding it
to Claude as a custom connector.

## API Endpoints
| Method | URL | Description |
|--------|-----|-------------|
| GET    | /api/students | Get all students |
| GET    | /api/students/{id} | Get student by ID |
| POST   | /api/students | Add new student |
| PUT    | /api/students/{id} | Update student |
| DELETE | /api/students/{id} | Delete student |
