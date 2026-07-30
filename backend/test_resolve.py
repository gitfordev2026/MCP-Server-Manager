import asyncio
from app.db import session_local_factory
from app.models.db_models import MCPToolModel, AccessPolicyModel, ServerModel, BaseURLModel
from app.services.registry.exposure_service import resolve_exposable_tools

def main():
    with session_local_factory() as db:
        rows, mcp_rows = resolve_exposable_tools(
            db=db,
            mcp_tool_model=MCPToolModel,
            access_policy_model=AccessPolicyModel,
            server_model=ServerModel,
            base_url_model=BaseURLModel,
            registry_only=True,
            public_only=True
        )
        print("Rows:", rows)
        print("MCP Rows:", mcp_rows)

if __name__ == "__main__":
    main()
