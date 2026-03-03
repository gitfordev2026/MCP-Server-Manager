# Mock MCP + FastAPI Server

A fully-featured mock server combining **FastMCP** (MCP protocol) and **FastAPI** (REST API) for development and testing.

## Quick Start

```bash
pip install -r requirements.txt
uvicorn server:app --reload --port 8000
```

| Interface | URL |
|-----------|-----|
| MCP (SSE) | `http://localhost:8000/mcp` |
| Swagger UI | `http://localhost:8000/docs` |

## MCP — Tools (9)
| Tool | Description |
|------|-------------|
| `add` | Add two numbers |
| `get_current_time` | Return UTC timestamp |
| `random_number` | Random int between low/high |
| `reverse_string` | Reverse a string |
| `word_count` | Count words & characters |
| `get_user` | Look up user by ID (u1/u2/u3) |
| `create_note` | Create a note |
| `transform_case` | upper / lower / title |
| `calculate` | add / subtract / multiply / divide |

## MCP — Resources (4)
| URI | Description |
|-----|-------------|
| `data://users/all` | All users |
| `data://notes/all` | All notes |
| `data://server/info` | Server metadata |
| `data://config/roles` | Role permissions |

## MCP — Prompts (4)
| Prompt | Description |
|--------|-------------|
| `greeting_prompt` | Friendly greeting for a user |
| `summarise_prompt` | Summarise text within word limit |
| `bullets_to_prose_prompt` | Convert bullets to paragraph |
| `code_review_prompt` | Review a code snippet |

## REST Endpoints
- **Health**: GET `/`, `/health`, `/info`
- **Users**: GET/POST/DELETE `/users`, `/users/{id}`
- **Notes**: GET/POST/DELETE `/notes`, `/notes/{id}`
- **Utils**: POST `/echo`, GET `/random`, GET `/time`, POST `/calculate`

Seed data: users u1/u2/u3 (Alice/Bob/Charlie), notes n1/n2