"""
Mock MCP Server  ·  FastMCP + FastAPI
======================================
Install:
    pip install "fastmcp>=2.0" "fastapi>=0.115" "uvicorn[standard]>=0.34"

Run:
    uvicorn server:app --reload --port 8000

Endpoints:
    MCP (Streamable HTTP)  ->  http://localhost:8000/mcp/
    REST Swagger docs      ->  http://localhost:8000/docs
"""

from __future__ import annotations

import random
import datetime
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastmcp import FastMCP
import uvicorn


# ─────────────────────────────────────────────────────────────
#  Fake in-memory "database"
# ─────────────────────────────────────────────────────────────
_users: dict[str, dict] = {
    "u1": {"id": "u1", "name": "Alice",   "email": "alice@example.com",   "role": "admin"},
    "u2": {"id": "u2", "name": "Bob",     "email": "bob@example.com",     "role": "editor"},
    "u3": {"id": "u3", "name": "Charlie", "email": "charlie@example.com", "role": "viewer"},
}

_notes: dict[str, dict] = {
    "n1": {"id": "n1", "title": "Meeting Notes", "body": "Discuss Q3 roadmap.",   "author": "u1"},
    "n2": {"id": "n2", "title": "Ideas",          "body": "Build a cool MCP app.", "author": "u2"},
}


# ─────────────────────────────────────────────────────────────
#  1. FastMCP server
# ─────────────────────────────────────────────────────────────
mcp = FastMCP("MCP Mock Dev Server")


# ═════════════ TOOLS ═════════════════════════════════════════
# FIX: Use @mcp.tool() with parentheses — FastMCP 2.x requires the decorator
# to be called; bare @mcp.tool silently skips registration.

@mcp.tool()
def add(a: float, b: float) -> float:
    """Add two numbers and return the sum."""
    return a + b

@mcp.tool()
def get_current_time() -> str:
    """Return the current UTC timestamp as an ISO-8601 string."""
    return datetime.datetime.utcnow().isoformat() + "Z"

@mcp.tool()
def random_number(low: int = 1, high: int = 100) -> int:
    """Generate a random integer between low and high (inclusive)."""
    if low > high:
        raise ValueError("`low` must be <= `high`")
    return random.randint(low, high)

@mcp.tool()
def reverse_string(text: str) -> str:
    """Reverse the given string."""
    return text[::-1]

@mcp.tool()
def word_count(text: str) -> dict:
    """Count words and characters in the supplied text."""
    words = text.split()
    return {
        "word_count":     len(words),
        "char_count":     len(text),
        "char_no_spaces": len(text.replace(" ", "")),
    }

@mcp.tool()
def get_user(user_id: str) -> dict:
    """Look up a user by ID (try: u1, u2, u3)."""
    return _users.get(user_id) or {"error": f"User '{user_id}' not found"}

@mcp.tool()
def create_note(title: str, body: str, author_id: str) -> dict:
    """Create a new note. author_id must be an existing user ID."""
    if author_id not in _users:
        return {"error": f"Author '{author_id}' not found"}
    nid = f"n{len(_notes) + 1}"
    note = {"id": nid, "title": title, "body": body, "author": author_id}
    _notes[nid] = note
    return note

@mcp.tool()
def transform_case(text: str, mode: str = "upper") -> str:
    """Transform text case. mode: upper | lower | title."""
    modes = {"upper": str.upper, "lower": str.lower, "title": str.title}
    fn = modes.get(mode.lower())
    if not fn:
        raise ValueError(f"Unknown mode '{mode}'. Choose: upper | lower | title")
    return fn(text)

@mcp.tool()
def calculate(a: float, b: float, operation: str = "add") -> dict:
    """Simple calculator. operation: add | subtract | multiply | divide."""
    if operation == "add":        result = a + b
    elif operation == "subtract": result = a - b
    elif operation == "multiply": result = a * b
    elif operation == "divide":
        if b == 0:
            return {"error": "Division by zero"}
        result = a / b
    else:
        raise ValueError(f"Unknown operation '{operation}'")
    return {"a": a, "b": b, "operation": operation, "result": result}


# ═════════════ RESOURCES ═════════════════════════════════════
# FIX: Use @mcp.resource() with parentheses for the same reason as tools.

@mcp.resource("data://users/all")
def resource_all_users() -> list:
    """All users in the system."""
    return list(_users.values())

@mcp.resource("data://notes/all")
def resource_all_notes() -> list:
    """All notes in the system."""
    return list(_notes.values())

@mcp.resource("data://server/info")
def resource_server_info() -> dict:
    """Server metadata and capability list."""
    return {
        "name":      "MockDevServer",
        "version":   "1.0.0",
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        "tools":     ["add", "get_current_time", "random_number", "reverse_string",
                      "word_count", "get_user", "create_note", "transform_case", "calculate"],
        "resources": ["data://users/all", "data://notes/all",
                      "data://server/info", "data://config/roles"],
        "prompts":   ["greeting_prompt", "summarise_prompt",
                      "bullets_to_prose_prompt", "code_review_prompt"],
    }

@mcp.resource("data://config/roles")
def resource_roles() -> dict:
    """User role definitions and their permissions."""
    return {
        "admin":  {"read": True,  "write": True,  "delete": True},
        "editor": {"read": True,  "write": True,  "delete": False},
        "viewer": {"read": True,  "write": False, "delete": False},
    }


# ═════════════ PROMPTS ═══════════════════════════════════════
# FIX: Use @mcp.prompt() with parentheses.

@mcp.prompt()
def greeting_prompt(user_name: str, tone: str = "formal") -> str:
    """Generate a greeting for a named user in formal or casual tone."""
    style = "warmly and professionally" if tone == "formal" else "casually and cheerfully"
    return (
        f"You are a helpful assistant. Greet the user named '{user_name}' {style}. "
        "Keep it to 2-3 sentences."
    )

@mcp.prompt()
def summarise_prompt(text: str, max_words: int = 50) -> str:
    """Ask the model to summarise a block of text within a word limit."""
    return (
        f"Summarise the following text in no more than {max_words} words. "
        f"Be concise and preserve key points.\n\n---\n{text}\n---"
    )

@mcp.prompt()
def bullets_to_prose_prompt(bullets: str) -> str:
    """Convert bullet points into a polished paragraph."""
    return (
        "Convert the following bullet points into a single, coherent paragraph "
        "using natural language. Do not add new information.\n\n"
        f"Bullets:\n{bullets}"
    )

@mcp.prompt()
def code_review_prompt(code: str, language: str = "Python") -> str:
    """Code-review prompt for a given snippet and language."""
    return (
        f"You are a senior {language} developer. Review the following code for "
        "bugs, style issues, and potential improvements. Provide concise, "
        f"actionable feedback.\n\n```{language.lower()}\n{code}\n```"
    )


# ─────────────────────────────────────────────────────────────
#  2. Build MCP ASGI app
#     path="/mcp" keeps MCP isolated so it won't swallow REST routes.
# ─────────────────────────────────────────────────────────────
mcp_app = mcp.http_app(path="/mcp")


# ─────────────────────────────────────────────────────────────
#  3. Combined lifespan
#  FIX: Pass `mcp_app` (not `app`) to lifespan_context — the session manager
#  lives on the MCP ASGI app, not the outer FastAPI instance.
# ─────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    async with mcp_app.router.lifespan_context(mcp_app):   # <-- was (app)
        yield


# ─────────────────────────────────────────────────────────────
#  4. FastAPI app
# ─────────────────────────────────────────────────────────────
app = FastAPI(
    title="Mock MCP + REST API",
    description="FastMCP server embedded in FastAPI with REST endpoints for testing.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ──── Pydantic models ────────────────────────────────────────
class CreateUserRequest(BaseModel):
    name:  str
    email: str
    role:  str = "viewer"

class CreateNoteRequest(BaseModel):
    title:     str
    body:      str
    author_id: str

class EchoRequest(BaseModel):
    message: str
    repeat:  int = 1


# ═════════════ REST — Health ══════════════════════════════════

@app.get("/api", tags=["Health"], summary="Server root — all endpoints & capabilities")
def root():
    return {
        "server":    "MockDevServer",
        "version":   "1.0.0",
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        "endpoints": {
            "mcp": {
                "streamable_http": "http://localhost:8000/mcp/",
                "description":     "MCP Streamable HTTP transport (connect your MCP client here)",
            },
            "docs": {
                "swagger_ui":  "http://localhost:8000/docs",
                "redoc":       "http://localhost:8000/redoc",
                "openapi_json":"http://localhost:8000/openapi.json",
            },
            "rest": {
                "health":    "GET  /api/health",
                "info":      "GET  /api/info",
                "users":     ["GET /api/users", "GET /api/users/{id}", "POST /api/users", "DELETE /api/users/{id}"],
                "notes":     ["GET /api/notes", "GET /api/notes/{id}", "POST /api/notes", "DELETE /api/notes/{id}"],
                "utilities": ["GET /api/time", "GET /api/random", "POST /api/echo", "POST /api/calculate"],
            },
        },
        "mcp_capabilities": {
            "tools": [
                "add", "get_current_time", "random_number", "reverse_string",
                "word_count", "get_user", "create_note", "transform_case", "calculate",
            ],
            "resources": [
                "data://users/all",
                "data://notes/all",
                "data://server/info",
                "data://config/roles",
            ],
            "prompts": [
                "greeting_prompt",
                "summarise_prompt",
                "bullets_to_prose_prompt",
                "code_review_prompt",
            ],
        },
    }

@app.get("/api/health", tags=["Health"])
def health():
    return {"status": "healthy", "timestamp": datetime.datetime.utcnow().isoformat() + "Z"}

@app.get("/api/info", tags=["Health"])
def info():
    return {"server": "MockDevServer", "version": "1.0.0", "mcp_url": "/mcp/", "docs": "/docs"}


# ═════════════ REST — Users ═══════════════════════════════════

@app.get("/api/users", tags=["Users"])
def list_users():
    return {"users": list(_users.values()), "total": len(_users)}

@app.get("/api/users/{user_id}", tags=["Users"])
def get_user_rest(user_id: str):
    user = _users.get(user_id)
    if not user:
        raise HTTPException(404, f"User '{user_id}' not found")
    return user

@app.post("/api/users", status_code=201, tags=["Users"])
def create_user(req: CreateUserRequest):
    if req.role not in {"admin", "editor", "viewer"}:
        raise HTTPException(400, "Invalid role. Choose: admin | editor | viewer")
    uid = f"u{len(_users) + 1}"
    user = {"id": uid, "name": req.name, "email": req.email, "role": req.role}
    _users[uid] = user
    return user

@app.delete("/api/users/{user_id}", tags=["Users"])
def delete_user(user_id: str):
    if user_id not in _users:
        raise HTTPException(404, f"User '{user_id}' not found")
    return {"deleted": _users.pop(user_id)}


# ═════════════ REST — Notes ═══════════════════════════════════

@app.get("/api/notes", tags=["Notes"])
def list_notes():
    return {"notes": list(_notes.values()), "total": len(_notes)}

@app.get("/api/notes/{note_id}", tags=["Notes"])
def get_note(note_id: str):
    note = _notes.get(note_id)
    if not note:
        raise HTTPException(404, f"Note '{note_id}' not found")
    return note

@app.post("/api/notes", status_code=201, tags=["Notes"])
def create_note_rest(req: CreateNoteRequest):
    if req.author_id not in _users:
        raise HTTPException(400, f"Author '{req.author_id}' not found")
    nid = f"n{len(_notes) + 1}"
    note = {"id": nid, "title": req.title, "body": req.body, "author": req.author_id}
    _notes[nid] = note
    return note

@app.delete("/api/notes/{note_id}", tags=["Notes"])
def delete_note(note_id: str):
    if note_id not in _notes:
        raise HTTPException(404, f"Note '{note_id}' not found")
    return {"deleted": _notes.pop(note_id)}


# ═════════════ REST — Utilities ═══════════════════════════════

@app.post("/api/echo", tags=["Utilities"])
def echo(req: EchoRequest):
    if not 1 <= req.repeat <= 10:
        raise HTTPException(400, "`repeat` must be between 1 and 10")
    return {"messages": [req.message] * req.repeat}

@app.get("/api/random", tags=["Utilities"])
def random_endpoint(low: int = 1, high: int = 100):
    if low > high:
        raise HTTPException(400, "`low` must be <= `high`")
    return {"value": random.randint(low, high), "range": [low, high]}

@app.get("/api/time", tags=["Utilities"])
def current_time():
    now = datetime.datetime.utcnow()
    return {
        "utc":       now.isoformat() + "Z",
        "date":      now.date().isoformat(),
        "time":      now.time().isoformat(),
        "timestamp": int(now.timestamp()),
    }

@app.post("/api/calculate", tags=["Utilities"])
def calculate_rest(a: float, b: float, op: str = "add"):
    if op == "divide" and b == 0:
        raise HTTPException(400, "Division by zero")
    ops: dict[str, Any] = {
        "add":      a + b,
        "subtract": a - b,
        "multiply": a * b,
        "divide":   a / b if b != 0 else None,
    }
    if op not in ops:
        raise HTTPException(400, f"Unknown op '{op}'. Use: add | subtract | multiply | divide")
    return {"a": a, "b": b, "op": op, "result": ops[op]}


# ─────────────────────────────────────────────────────────────
#  5. Mount MCP LAST — after all REST routes are registered.
#  FIX: Mount at "/" only after FastAPI has registered its own routes.
#  Because FastAPI checks its own router first before falling through to
#  mounted sub-applications, REST routes at /api/* are safe. The MCP app
#  internally only handles /mcp and /mcp/*, so nothing else is swallowed.
# ─────────────────────────────────────────────────────────────
app.mount("/", mcp_app)


if __name__ == "__main__":
    # FIX: Removed ws="wsproto" — streamable HTTP transport doesn't use
    # WebSockets and wsproto may not be installed, causing a startup crash.
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)