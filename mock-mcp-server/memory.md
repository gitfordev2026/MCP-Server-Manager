# Mock MCP Server - Memory

## Purpose
The `mock-mcp-server` is a sandbox application designed around testing and development scenarios. It functions as a dual-protocol server by simultaneously offering:
1. **MCP (Model Context Protocol)** interaction through Streamable HTTP endpoints.
2. **REST API** traditional endpoints for standard CRUD and utility operations.

It is intended as a fully contained, mock environment without external database dependencies, providing a variety of tools, resources, and prompts that mimic real-world server functionality.

## Application Architecture
- **Frameworks**: Built using `FastAPI` (for REST endpoints and routing) and `FastMCP` (specifically for MCP implementations).
- **Embedded Server**: The `FastMCP` application (`mcp_app`) is built as an ASGI application (with its path routed to `/`) and then mounted onto the `FastAPI` app under the `/mcp` route.
- **Session Management**: They share a combined lifespan contextual manager (`lifespan`) mapping `FastMCP`'s lifecycle to the parent `FastAPI` instance.
- **Server Runner**: Runs on `uvicorn` typically served at port 8000.

## Data Storage
- Relies exclusively on **In-Memory Python Dictionaries**.
  - `_users`: Stores user metadata (IDs `u1`, `u2`, `u3` with predefined roles like admin, editor, viewer).
  - `_notes`: Stores text notes authored by users.
- Data resets upon server restart and persists only during the lifespan of the background process.

## Capabilities

### MCP Features
- **Tools (9)**:
  - Math: `add`, `random_number`, `calculate`
  - Text Processing: `reverse_string`, `word_count`, `transform_case`
  - Data Lookup/Mutation: `get_user`, `create_note`
  - State: `get_current_time`
- **Resources (4)**: Structured data payloads accessible via URIs.
  - `data://users/all`: List of all users.
  - `data://notes/all`: List of all notes.
  - `data://server/info`: Server metadata and active capabilities.
  - `data://config/roles`: Role descriptions and respective permissions.
- **Prompts (4)**: Prepared text templates for model usage.
  - `greeting_prompt`, `summarise_prompt`, `bullets_to_prose_prompt`, `code_review_prompt`.

### REST Endpoints
Alongside the MCP mount, specific REST equivalents exist mapped directly to FastAPI routers using Pydantic validation:
- **Health**: `/`, `/health`, `/info`
- **Users**: GET/POST/DELETE at `/users`
- **Notes**: GET/POST/DELETE at `/notes`
- **Utilities**: `/echo`, `/random`, `/time`, `/calculate`

## Development Context
- Python `__future__` feature annotations are enabled.
- Using native Pydantic models for REST request schema validation.
- All HTTP interactions are handled effectively synchronously, albeit supported by FastAPI's async engine (the lifespan context manager handles fastmcp `async` start).
- For further development, be cautious around sharing state. Since `_users` and `_notes` form the source of truth, both the MCP and REST tools hook directly into these structures to reflect changes.
