from __future__ import annotations

import asyncio
import json
import re
from typing import Any, Callable, Optional, List, Dict, Tuple
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
import httpx
from mcp_use import MCPClient
from pydantic import BaseModel
from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.rbac import get_request_actor
from app.env import ENV
from app.models.db_models import (
    AccessPolicyModel,
    BaseURLModel,
    MCPToolModel,
    ServerModel,
)
from app.services.registry.exposure_service import resolve_exposable_tools
from app.services.mcp_client_runtime import call_server_tool
from app.services.agent_runtime import (
    generate_direct_response,
    stream_direct_response_chunks,
)
from app.services.langfuse_service import langfuse_service


from app.core.logger import get_logger


logger = get_logger(__name__)

# =========================================================
# Request Models
# =========================================================

class PlaygroundQueryRequest(BaseModel):
    prompt: str
    app_name: Optional[str] = None
    selected_tools: Optional[List[str]] = None
    model: Optional[str] = None
    history: Optional[List[Dict[str, str]]] = None


# =========================================================
# MCP Client Utilities
# =========================================================

def _normalize_mcp_url(url: str) -> str:
    val = (url or "").strip()
    if val and not val.endswith("/"):
        return f"{val}/"
    return val


def _build_mcp_client() -> MCPClient:
    return MCPClient(
        {
            "mcpServers": {
                ENV.agent_mcp_server_name: {
                    "url": _normalize_mcp_url(ENV.agent_mcp_server_url),
                }
            }
        }
    )


async def _list_combined_tool_names(actor: Optional[Dict[str, Any]] = None) -> List[str]:
    try:
        catalog = _list_exposed_tool_catalog(actor)
        tool_names = sorted({str(item.get("name", "")).strip() for item in catalog if str(item.get("name", "")).strip()})
        if tool_names:
            return tool_names
    except Exception as exc:
        logger.warning(f"Could not fetch catalog tools from DB: {exc}")

    return []


# =========================================================
# Database Utilities
# =========================================================

def _list_exposed_tool_catalog(actor: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """
    Returns tool metadata grouped by application from DB.
    """
    db = SessionLocal()
    try:
        role = actor.get("primary_role") if actor else "developer"
        sub = actor.get("subject") or actor.get("sub") or actor.get("username") if actor else None
        username = actor.get("username") if actor else None

        if actor and role != "admin":
            user_ids = [uid for uid in (sub, username) if uid]
            # Query only servers and applications this developer created or are public (created_by_user_id is None)
            srv_ids = db.scalars(
                select(ServerModel.id).where(
                    (ServerModel.created_by_user_id.in_(user_ids)) | (ServerModel.created_by_user_id == None)
                )
            ).all()
            app_ids = db.scalars(
                select(BaseURLModel.id).where(
                    (BaseURLModel.created_by_user_id.in_(user_ids)) | (BaseURLModel.created_by_user_id == None)
                )
            ).all()

            tools = db.scalars(
                select(MCPToolModel).where(
                    MCPToolModel.is_deleted == False,
                    MCPToolModel.admin_enabled == True,
                    MCPToolModel.owner_enabled == True,
                    (MCPToolModel.server_id.in_(srv_ids)) |
                    (MCPToolModel.raw_api_id.in_(app_ids)) |
                    (MCPToolModel.created_by_user_id.in_(user_ids))
                )
            ).all()
        else:
            tools = db.scalars(
                select(MCPToolModel).where(
                    MCPToolModel.is_deleted == False,
                    MCPToolModel.admin_enabled == True,
                    MCPToolModel.owner_enabled == True,
                )
            ).all()

        tools_list = []
        for t in tools:
            tools_list.append({
                "name": t.name,
                "title": t.display_name or t.name,
                "description": t.description or "",
                "app": t.owner_id or "default",
            })
        return tools_list
    except Exception as exc:
        logger.warning(f"Error querying tool catalog from DB: {exc}")
        return []
    finally:
        db.close()


def _group_tools_by_app(catalog: List[Dict[str, Any]]) -> Dict[str, List[str]]:
    grouped: Dict[str, List[str]] = {}
    for tool in catalog:
        app = str(tool.get("app", "unknown"))
        name = str(tool.get("name", ""))
        if name:
            grouped.setdefault(app, []).append(name)
    return grouped


def _raw_tool_name(tool_name: str) -> str:
    value = str(tool_name or "").strip()
    if value.startswith("mcp__") and "__" in value:
        return value.rsplit("__", 1)[-1]
    return value


def _tool_name_in_allowed(tool_name: str, allowed: set[str]) -> bool:
    value = str(tool_name or "").strip()
    return value in allowed or _raw_tool_name(value) in allowed


def _normalize_selected_tools(
    requested_tools: Optional[List[str]],
    all_tools: List[str],
) -> Tuple[List[str], List[str]]:
    if not requested_tools:
        return [], []

    available = set(all_tools)
    normalized: List[str] = []
    unknown: List[str] = []

    for tool_name in requested_tools:
        candidate = str(tool_name or "").strip()
        raw_candidate = _raw_tool_name(candidate)
        if candidate in available:
            normalized.append(candidate)
        elif raw_candidate in available:
            normalized.append(raw_candidate)
        else:
            unknown.append(candidate)

    deduped = list(dict.fromkeys(normalized))
    return deduped, unknown


# =========================================================
# Tool Retrieval Layer (context-window safe)
# =========================================================

def _tokenize(text: str) -> List[str]:
    return [t for t in text.lower().replace("-", "_").split() if t]


def _score_tool(prompt_tokens: set[str], tool_name: str) -> int:
    parts = tool_name.lower().split("_")
    return sum(1 for p in parts if p in prompt_tokens)


def _select_relevant_tools(
    prompt: str,
    tools: List[str],
    max_tools: int = 12,
) -> List[str]:
    """
    Lightweight keyword-based tool retrieval.
    Prevents context overflow by limiting tools sent to LLM.
    """
    tokens = set(_tokenize(prompt))
    if not tokens:
        return tools[:max_tools]

    scored: List[Tuple[int, str]] = []
    for tool in tools:
        score = _score_tool(tokens, tool)
        if score > 0:
            scored.append((score, tool))

    scored.sort(reverse=True)

    selected = [tool for _, tool in scored[:max_tools]]

    if not selected:
        # fallback to deterministic subset
        selected = tools[:max_tools]

    return selected


from app.services.inference_model_service import fetch_available_models, get_default_model


# =========================================================
# Prompt & Model Utilities
# =========================================================

def _normalize_model(model: Optional[str]) -> str:
    if model and model.strip():
        return model.strip()
    return ENV.agent_ollama_model or "gemma4:31b-cloud"


def _build_tool_only_instructions(selected_tools: List[str]) -> str:
    """
    Build rich prompt with tool Request Schemas, parameter types, and REQUIRED rules.
    """
    if not selected_tools:
        return (
            "You are a strict, deterministic tool-calling assistant. You have NO tools available for this query. "
            "You are STRICTLY FORBIDDEN from inventing tool names or parameters. "
            "Respond strictly with: 'No matching tool found for this operation'"
        )

    from app.main import openapi_tool_catalog
    catalog_tools = openapi_tool_catalog.tools if openapi_tool_catalog else {}

    tool_lines: List[str] = []
    for tool_name in selected_tools:
        tool_def = catalog_tools.get(tool_name)
        if tool_def and getattr(tool_def, "input_schema", None):
            schema = tool_def.input_schema or {}
            props = schema.get("properties") or {}
            req_list = schema.get("required") or []

            param_descs: List[str] = []
            for p_name, p_info in props.items():
                if p_name in {"timeout_seconds"}:
                    continue
                if not isinstance(p_info, dict):
                    continue
                p_type = p_info.get("type", "any")
                is_req = "REQUIRED" if p_name in req_list else "optional"
                p_desc = p_info.get("description") or p_info.get("title") or ""
                param_descs.append(f"      - `{p_name}` ({p_type}, {is_req}): {p_desc}")

            param_str = "\n".join(param_descs) if param_descs else "      (No parameters required)"
            req_str = f" [REQUIRED FIELDS: {', '.join(req_list)}]" if req_list else ""

            tool_lines.append(
                f"- Tool Name: `{tool_name}` ({tool_def.method.upper()} {tool_def.path})\n"
                f"    Description: {tool_def.description}\n"
                f"    Request Schema{req_str}:\n{param_str}"
            )
        else:
            tool_lines.append(f"- Tool Name: `{tool_name}`")

    tools_block = "\n".join(tool_lines)

    return (
        "You are an MCP tool-using agent.\n"
        "Use tools whenever they are relevant.\n"
        "Do not return JSON tool calls, function-call plans, or parameter objects to the user.\n\n"
        "CRITICAL TOOL PARAMETER RULES:\n"
        "1. Examine the Request Schema for each tool carefully.\n"
        "2. IF ANY REQUIRED PARAMETER IS MISSING from the user's prompt or conversation context, DO NOT EXECUTE THE TOOL WITH MISSING REQUIRED PARAMETERS.\n"
        "3. Instead, ask the user directly and politely to supply the missing required parameter(s) before attempting to call the tool.\n"
        "4. When calling a tool, pass all required arguments matching their expected data types (integer, string, etc.).\n"
        "5. If you execute a tool, summarize the result clearly for the user.\n\n"
        "Available Tools & Request Schemas:\n"
        f"{tools_block}\n\n"
        "If none of these tools apply, say: "
        "'No suitable tool available with the current tool set.'"
    )


def _should_bypass_mcp_agent(prompt: str) -> bool:
    """
    Detect documentation generation or meta prompts
    that should bypass tool usage.
    """
    normalized = " ".join((prompt or "").lower().split())

    bypass_signals = [
        "api documentation",
        "tool description",
        "generate description",
        "endpoint description",
        "1-2 sentences only",
    ]

    return any(s in normalized for s in bypass_signals)


def _build_greeting_directive(request: PlaygroundQueryRequest) -> Optional[str]:
    prompt = " ".join((request.prompt or "").strip().split())
    lowered = prompt.lower()
    if not lowered:
        return None

    direct_greetings = {"hi", "hello", "hey", "good morning", "good afternoon", "good evening"}
    if lowered in direct_greetings:
        return (
            "Reply with a short, friendly greeting in plain text. "
            "Do not mention tools, JSON, function calls, or internal reasoning."
        )

    match = re.fullmatch(r"(?:greet|say hello to|say hi to)\s+([a-zA-Z][a-zA-Z .'-]{0,60})", prompt, re.IGNORECASE)
    if match:
        user_name = match.group(1).strip()
        return (
            f"Greet the user named '{user_name}' in 1-2 short sentences in plain text. "
            "Be natural and friendly. Do not mention tools, JSON, function calls, or internal reasoning."
        )

    return None


def _is_capability_prompt(prompt: str) -> bool:
    normalized = " ".join((prompt or "").strip().lower().split())
    if not normalized:
        return False

    capability_signals = [
        "what can you do",
        "what do you do",
        "how can you help",
        "help me",
        "capabilities",
        "available functions",
        "available commands",
    ]
    return any(signal in normalized for signal in capability_signals)


def _is_recursion_limit_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return "recursion" in msg and "stop condition" in msg


def _is_tool_inventory_prompt(prompt: str) -> bool:
    normalized = " ".join((prompt or "").strip().lower().split())
    if not normalized:
        return False

    exact_matches = {
        "list tools",
        "list all tools",
        "list all tools available",
        "show tools",
        "show all tools",
        "available tools",
        "what tools are available",
        "tools",
    }
    if normalized in exact_matches:
        return True

    return "tool" in normalized and (
        "list" in normalized or "show" in normalized or "available" in normalized
    )


def _normalized_user_prompts(request: PlaygroundQueryRequest) -> List[str]:
    prompts: List[str] = []
    for item in request.history or []:
        if str(item.get("role") or "").lower() != "user":
            continue
        content = " ".join(str(item.get("content") or "").strip().lower().split())
        if content:
            prompts.append(content)
    current = " ".join((request.prompt or "").strip().lower().split())
    if current:
        prompts.append(current)
    return prompts


def _wants_descriptions(request: PlaygroundQueryRequest) -> bool:
    prompts = _normalized_user_prompts(request)
    if not prompts:
        return False

    current = prompts[-1]
    if "description" in current or "descriptions" in current:
        return True

    if current in {"with descriptions", "include descriptions", "show descriptions"}:
        return True

    if len(prompts) >= 2:
        previous = prompts[-2]
        if _is_tool_inventory_prompt(previous) and current.startswith("with "):
            return "description" in current

    return False


def _effective_prompt(request: PlaygroundQueryRequest) -> str:
    history_lines: List[str] = []
    for item in request.history or []:
        role = str(item.get("role") or "").strip().lower()
        content = str(item.get("content") or "").strip()
        if role not in {"user", "assistant"} or not content:
            continue
        label = "User" if role == "user" else "Assistant"
        history_lines.append(f"{label}: {content}")

    prompt = request.prompt.strip()
    if not history_lines:
        return prompt

    return (
        "Conversation so far:\n"
        f"{chr(10).join(history_lines)}\n\n"
        f"User: {prompt}"
    )


def _build_tool_inventory_response_from_catalog(
    catalog: List[Dict[str, Any]],
    allowed_tool_names: List[str],
    *,
    include_descriptions: bool,
) -> str:
    allowed_set = set(allowed_tool_names)
    lines: List[str] = []

    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for item in catalog:
        name = str(item.get("name", "")).strip()
        if not name or not _tool_name_in_allowed(name, allowed_set):
            continue
        app = str(item.get("app", "unknown")).strip() or "unknown"
        grouped.setdefault(app, []).append(item)

    if not grouped:
        if not allowed_tool_names:
            return "No tools available for the current selection."
        lines.append(f"Available tools for the current selection ({len(allowed_tool_names)}):")
        for name in sorted(dict.fromkeys(allowed_tool_names)):
            lines.append(f"- {name}")
        return "\n".join(lines)

    total = sum(len(items) for items in grouped.values())
    lines.append(f"Available tools for the current selection ({total}):")
    for app in sorted(grouped.keys()):
        lines.append("")
        lines.append(f"{app}:")
        for item in sorted(grouped[app], key=lambda tool: str(tool.get("name", ""))):
            name = str(item.get("name", "")).strip()
            description = str(item.get("description", "") or "").strip()
            if include_descriptions and description:
                lines.append(f"- {name}: {description}")
            else:
                lines.append(f"- {name}")

    return "\n".join(lines)


def _build_capability_summary_from_catalog(
    catalog: List[Dict[str, Any]],
    allowed_tool_names: List[str],
) -> str:
    allowed_set = set(allowed_tool_names)
    matched_items = [
        item for item in catalog
        if _tool_name_in_allowed(str(item.get("name", "")).strip(), allowed_set)
    ]

    if not matched_items:
        if not allowed_tool_names:
            return "I can chat, answer questions, and use tools when they are available."
        sample = ", ".join(sorted(dict.fromkeys(allowed_tool_names))[:6])
        return (
            "I can help by using the tools available in this context. "
            f"For example: {sample}."
        )

    descriptions = []
    for item in matched_items[:6]:
        title = str(item.get("title") or item.get("name") or "").strip()
        description = str(item.get("description") or "").strip()
        if title and description:
            descriptions.append(f"- {title}: {description}")
        elif title:
            descriptions.append(f"- {title}")

    lines = [
        "I can help with the tools available in this context. Here are some examples:",
        *descriptions,
    ]

    total = len({str(item.get('name') or '').strip() for item in matched_items if str(item.get('name') or '').strip()})
    if total > len(descriptions):
        lines.append(f"And {total - len(descriptions)} more tool(s) are also available.")

    return "\n".join(lines)


def _jsonl_event(event_type: str, **payload: Any) -> bytes:
    return (
        json.dumps({"type": event_type, **payload}, ensure_ascii=True) + "\n"
    ).encode("utf-8")


async def _stream_text_chunks(text: str) -> Any:
    chunk_size = 24
    for index in range(0, len(text), chunk_size):
        yield _jsonl_event("chunk", content=text[index:index + chunk_size])
        await asyncio.sleep(0.01)


def _extract_text_from_tool_result(result: Dict[str, Any]) -> str:
    parts: List[str] = []
    for item in result.get("content") or []:
        text = str(item.get("text") or "").strip()
        if text:
            parts.append(text)

    if parts:
        return "\n".join(parts).strip()

    structured = result.get("structuredContent")
    if structured is not None:
        if isinstance(structured, str):
            return structured.strip()
        return json.dumps(structured, ensure_ascii=True, indent=2)

    return ""


def _resolve_tool_name(candidate_name: str, allowed_tools: List[str]) -> Optional[str]:
    if not candidate_name:
        return None
    allowed_set = set(allowed_tools)
    if candidate_name in allowed_set:
        return candidate_name

    import re
    def _norm(s: str) -> str:
        return re.sub(r'[^a-zA-Z0-9]', '', s).lower()

    cand_norm = _norm(candidate_name)
    if not cand_norm:
        return None

    # 1. Exact normalized match (e.g. mcpclientsecurehealthhealthget -> mcp_client_secure__health_health_get)
    for tool in allowed_tools:
        if _norm(tool) == cand_norm:
            return tool

    # 2. Substring / suffix match
    for tool in allowed_tools:
        tool_norm = _norm(tool)
        if tool_norm.endswith(cand_norm) or cand_norm.endswith(tool_norm):
            return tool

    return None


def _parse_raw_tool_call(text: Any) -> Optional[Tuple[str, Dict[str, Any]]]:
    # Check if text is an object or dict with tool_calls attribute/key
    if hasattr(text, "tool_calls") and getattr(text, "tool_calls"):
        tcs = getattr(text, "tool_calls")
        if isinstance(tcs, list) and len(tcs) > 0:
            tc = tcs[0]
            if isinstance(tc, dict):
                return tc.get("name"), tc.get("args") or tc.get("parameters") or {}

    if isinstance(text, dict):
        if "tool_calls" in text and text["tool_calls"]:
            tc = text["tool_calls"][0]
            if isinstance(tc, dict):
                return tc.get("name"), tc.get("args") or tc.get("parameters") or {}
        if "name" in text:
            return text.get("name"), text.get("parameters") or text.get("arguments") or text.get("args") or {}

    candidate = str(text or "").strip()
    if not candidate:
        return None

    import re
    import json

    # 1. Try direct JSON parse
    try:
        payload = json.loads(candidate)
        if isinstance(payload, dict) and "name" in payload:
            name = str(payload.get("name") or "").strip()
            args = payload.get("parameters") or payload.get("arguments") or payload.get("args") or {}
            if name and isinstance(args, dict):
                return name, args
    except Exception:
        pass

    # 2. Try code fence ```json ... ``` block
    match = re.search(r'```(?:json)?\s*(\{[\s\S]*?\})\s*```', candidate)
    if match:
        try:
            payload = json.loads(match.group(1).strip())
            if isinstance(payload, dict) and "name" in payload:
                name = str(payload.get("name") or "").strip()
                args = payload.get("parameters") or payload.get("arguments") or payload.get("args") or {}
                if name and isinstance(args, dict):
                    return name, args
        except Exception:
            pass

    # 3. Try parsing substring between outer braces { ... }
    first_brace = candidate.find('{')
    last_brace = candidate.rfind('}')
    if first_brace != -1 and last_brace > first_brace:
        json_substr = candidate[first_brace:last_brace + 1]
        try:
            payload = json.loads(json_substr)
            if isinstance(payload, dict) and "name" in payload:
                name = str(payload.get("name") or "").strip()
                args = payload.get("parameters") or payload.get("arguments") or payload.get("args") or {}
                if name and isinstance(args, dict):
                    return name, args
        except Exception:
            pass

    return None


def _format_tool_result_human_readable(tool_name: str, arguments: Dict[str, Any], tool_result: Any) -> str:
    data = tool_result
    if isinstance(tool_result, dict):
        if "body" in tool_result:
            data = tool_result["body"]
        elif "structuredContent" in tool_result:
            data = tool_result["structuredContent"]
            if isinstance(data, dict) and "body" in data:
                data = data["body"]

    if isinstance(data, str):
        try:
            data = json.loads(data)
        except Exception:
            pass

    clean_tool_title = tool_name.replace("app__", "").replace("mcp__", "").replace("__", " ").replace("_", " ").title()

    # Detect 422 Unprocessable Entity / FastAPI Validation Errors
    if isinstance(data, dict) and ("detail" in data or "message" in data):
        detail = data.get("detail")
        if isinstance(detail, list) and any(isinstance(err, dict) and "loc" in err for err in detail):
            missing_fields: List[str] = []
            for err in detail:
                if isinstance(err, dict):
                    loc = err.get("loc") or []
                    msg = err.get("msg") or "Field required"
                    field = str(loc[-1]) if loc else "parameter"
                    missing_fields.append(f"- **`{field}`**: {msg}")

            fields_str = "\n".join(missing_fields)
            return (
                f"⚠️ **Missing Parameter Notice for `{clean_tool_title}`**:\n\n"
                f"The tool execution requires additional parameters:\n{fields_str}\n\n"
                f"Please reply with the missing parameter(s) so I can complete your request."
            )

    sections: List[str] = []
    sections.append(f"### 📄 {clean_tool_title}\n")

    def _render_dict_clean(d: dict, depth: int = 0) -> str:
        items = []
        indent = "  " * depth
        for k, v in d.items():
            key_label = k.replace("_", " ").title()
            if isinstance(v, dict):
                items.append(f"{indent}- **{key_label}**:")
                items.append(_render_dict_clean(v, depth + 1))
            elif isinstance(v, list):
                if not v:
                    items.append(f"{indent}- **{key_label}**: _No entries_")
                elif all(isinstance(x, dict) for x in v):
                    items.append(f"{indent}- **{key_label}**:")
                    items.append(_render_table(v, depth + 1))
                else:
                    items.append(f"{indent}- **{key_label}**: {', '.join(str(x) for x in v)}")
            else:
                val_str = "None" if v is None or v == "" else str(v)
                items.append(f"{indent}- **{key_label}**: `{val_str}`")
        return "\n".join(items)

    def _render_table(items: List[dict], depth: int = 0) -> str:
        if not items:
            return "_No items_"
        keys = list(dict.fromkeys(k for item in items if isinstance(item, dict) for k in item.keys()))
        if not keys:
            return "_No structured data_"

        indent = "  " * depth
        header_line = f"{indent}| " + " | ".join(k.replace("_", " ").title() for k in keys) + " |"
        divider_line = f"{indent}| " + " | ".join("---" for _ in keys) + " |"
        rows = []
        for item in items:
            row_vals = [str(item.get(k, "")) for k in keys]
            rows.append(f"{indent}| " + " | ".join(row_vals) + " |")
        return "\n".join([header_line, divider_line, *rows])

    if isinstance(data, dict):
        sections.append(_render_dict_clean(data))
    elif isinstance(data, list):
        if all(isinstance(x, dict) for x in data):
            sections.append(_render_table(data))
        else:
            sections.append("\n".join(f"- `{x}`" for x in data))
    else:
        sections.append(f"`{str(data)}`")

    sections.append("\n---")
    sections.append(f"**Tool Executed**: `{tool_name}`")
    sections.append(f"**Arguments**: `{json.dumps(arguments, ensure_ascii=True)}`")

    return "\n".join(sections)


async def _maybe_execute_raw_tool_call(
    result_text: Any,
    allowed_tools: List[str],
    user_token: Optional[str] = None,
) -> Optional[str]:
    parsed = _parse_raw_tool_call(result_text)
    if parsed is None:
        return None

    candidate_name, arguments = parsed
    canonical_tool = _resolve_tool_name(candidate_name, allowed_tools)
    if not canonical_tool:
        logger.warning(f"Could not resolve raw tool call candidate '{candidate_name}' among allowed tools: {allowed_tools}")
        return None

    logger.info(f"Executing tool '{canonical_tool}' (resolved from '{candidate_name}') with args: {arguments}")

    tool_result = None

    # 1. Direct in-process execution via combined_apps_mcp first
    try:
        from app.main import combined_apps_mcp
        res = await combined_apps_mcp.call_tool(canonical_tool, arguments, user_token=user_token)
        if hasattr(res, "structured_content") and res.structured_content:
            tool_result = res.structured_content
        elif hasattr(res, "content") and res.content:
            tool_result = {"content": [getattr(item, "text", str(item)) for item in res.content]}
        else:
            tool_result = getattr(res, "structured_content", res)
    except Exception as exc:
        logger.warning(f"combined_apps_mcp.call_tool direct execution failed ({exc}), attempting call_server_tool")

    # 2. Fallback to HTTP call_server_tool
    if tool_result is None or (isinstance(tool_result, dict) and tool_result.get("error") == "no_matching_tool"):
        try:
            tool_result = await call_server_tool(
                ENV.agent_mcp_server_name,
                ENV.agent_mcp_server_url,
                canonical_tool,
                arguments,
                timeout_sec=30.0,
            )
        except Exception as inner_exc:
            return f"Error executing tool '{canonical_tool}': {inner_exc}"

    return _format_tool_result_human_readable(canonical_tool, arguments, tool_result)


def _append_tool_usage_note(response_text: Any, agent: Any) -> str:
    text = str(response_text or "").strip()
    used_tools = list(getattr(agent, "tools_used_names", []) or [])
    if not used_tools:
        return text

    if "Tool used:" in text or "Tools used:" in text:
        return text

    if len(used_tools) == 1:
        return f"{text}\n\nTool used: {used_tools[0]}"

    tool_lines = "\n".join(f"- {name}" for name in used_tools)
    return f"{text}\n\nTools used:\n{tool_lines}"


async def _run_agent_query(
    request: PlaygroundQueryRequest,
    build_agent_with_model: Callable[..., Any],
    actor: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    model = _normalize_model(request.model)
    effective_prompt = _effective_prompt(request)
    user_token = actor.get("token") if actor else None

    if _is_capability_prompt(request.prompt):
        all_tools = await _list_combined_tool_names(actor)
        catalog = _list_exposed_tool_catalog(actor)
        return {
            "response": _build_capability_summary_from_catalog(catalog, all_tools),
            "mode": "capability_summary",
        }

    greeting_directive = _build_greeting_directive(request)
    if greeting_directive:
        result = await generate_direct_response(
            effective_prompt,
            model=model,
            additional_instructions=greeting_directive,
        )
        return {"response": result, "mode": "direct_llm"}

    if _should_bypass_mcp_agent(request.prompt):
        result = await generate_direct_response(
            effective_prompt,
            model=model,
            additional_instructions="Answer directly without tools.",
        )
        return {"response": result, "mode": "direct_llm"}

    all_tools = await _list_combined_tool_names(actor)
    selected_tools = all_tools

    if not all_tools:
        result = await generate_direct_response(
            effective_prompt,
            model=model,
            additional_instructions="Answer directly and naturally. Note: No active tools are registered in the MCP manager yet.",
        )
        return {"response": result, "mode": "direct_llm"}

    if _is_tool_inventory_prompt(request.prompt):
        catalog = _list_exposed_tool_catalog(actor)
        return {
            "response": _build_tool_inventory_response_from_catalog(
                catalog,
                all_tools,
                include_descriptions=_wants_descriptions(request),
            ),
            "mode": "tool_inventory",
        }

    instructions = _build_tool_only_instructions(selected_tools)

    agent = build_agent_with_model(
        model,
        disallowed_tools=[
            t for t in all_tools if t not in selected_tools
        ],
        additional_instructions=instructions,
        max_steps=8,
        retry_on_error=False,
        memory_enabled=False,
    )

    if hasattr(agent, "tools_used_names"):
        agent.tools_used_names.clear()

    try:
        result = await asyncio.wait_for(agent.run(effective_prompt), timeout=45.0)
        rescued = await _maybe_execute_raw_tool_call(result, selected_tools, user_token=user_token)
        if rescued is not None:
            result = rescued
        else:
            result = _append_tool_usage_note(result, agent)
    except Exception as exc:
        logger.warning(f"MCPAgent execution failed ({exc}), falling back to direct LLM response")
        raw_direct = await generate_direct_response(
            effective_prompt,
            model=model,
            additional_instructions=instructions,
        )
        rescued = await _maybe_execute_raw_tool_call(raw_direct, selected_tools, user_token=user_token)
        result = rescued if rescued is not None else raw_direct

    return {"response": result, "mode": "mcp_agent"}


async def _run_playground_query(
    request: PlaygroundQueryRequest,
    build_agent_with_model: Callable[..., Any],
    actor: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    model = _normalize_model(request.model)
    user_token = actor.get("token") if actor else None

    effective_prompt = _effective_prompt(request)

    all_tools = await _list_combined_tool_names(actor)

    if not all_tools:
        result = await generate_direct_response(
            effective_prompt,
            model=model,
            additional_instructions="Answer directly and naturally. Note: No active tools are registered in the MCP manager yet.",
        )
        return {"response": result, "mode": "direct_llm"}

    if request.selected_tools:
        selected_tools, unknown = _normalize_selected_tools(
            request.selected_tools,
            all_tools,
        )
        if unknown:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown tools requested: {unknown}",
            )
    else:
        selected_tools = all_tools

    if _is_capability_prompt(request.prompt):
        catalog = _list_exposed_tool_catalog(actor)
        return {
            "response": _build_capability_summary_from_catalog(catalog, selected_tools),
            "mode": "capability_summary",
        }

    greeting_directive = _build_greeting_directive(request)
    if greeting_directive:
        result = await generate_direct_response(
            effective_prompt,
            model=model,
            additional_instructions=greeting_directive,
        )
        return {"response": result, "mode": "direct_llm"}

    if _should_bypass_mcp_agent(request.prompt):
        result = await generate_direct_response(
            effective_prompt,
            model=model,
            additional_instructions="Answer directly.",
        )
        return {"response": result, "mode": "direct_llm"}

    if _is_tool_inventory_prompt(request.prompt) or _wants_descriptions(request):
        catalog = _list_exposed_tool_catalog(actor)
        return {
            "response": _build_tool_inventory_response_from_catalog(
                catalog,
                selected_tools,
                include_descriptions=_wants_descriptions(request),
            ),
            "mode": "tool_inventory",
        }

    instructions = _build_tool_only_instructions(selected_tools)

    agent = build_agent_with_model(
        model,
        disallowed_tools=[
            t for t in all_tools if t not in selected_tools
        ],
        additional_instructions=instructions,
        max_steps=8,
        retry_on_error=False,
        memory_enabled=False,
    )

    try:
        result = await asyncio.wait_for(agent.run(effective_prompt), timeout=45.0)
        rescued = await _maybe_execute_raw_tool_call(result, selected_tools, user_token=user_token)
        if rescued is not None:
            result = rescued
        else:
            result = _append_tool_usage_note(result, agent)
    except Exception as exc:
        logger.warning(f"MCPAgent execution failed ({exc}), falling back to direct LLM response")
        raw_direct = await generate_direct_response(
            effective_prompt,
            model=model,
            additional_instructions=instructions,
        )
        rescued = await _maybe_execute_raw_tool_call(raw_direct, selected_tools, user_token=user_token)
        result = rescued if rescued is not None else raw_direct

    return {"response": result, "mode": "mcp_agent"}


async def _stream_agent_query(
    request: PlaygroundQueryRequest,
    build_agent_with_model: Callable[..., Any],
    *,
    direct_instructions: str,
    runner: Callable[[PlaygroundQueryRequest, Callable[..., Any], Optional[Dict[str, Any]]], Any],
    actor: Optional[Dict[str, Any]] = None,
):
    yield _jsonl_event("start")

    model = _normalize_model(request.model)

    try:
        if _should_bypass_mcp_agent(request.prompt):
            yield _jsonl_event("meta", mode="direct_llm")
            async for chunk in stream_direct_response_chunks(
                request.prompt,
                model=model,
                additional_instructions=direct_instructions,
            ):
                yield _jsonl_event("chunk", content=chunk)
            yield _jsonl_event("end")
            return

        yield _jsonl_event("meta", mode="mcp_agent", status="thinking")
        
        import asyncio
        from langchain_core.callbacks import AsyncCallbackHandler

        queue = asyncio.Queue()

        class StreamCallback(AsyncCallbackHandler):
            async def on_llm_new_token(self, token: str, **kwargs):
                if token:
                    await queue.put(token)
            async def on_llm_end(self, response, **kwargs):
                await queue.put(None)
            async def on_llm_error(self, error, **kwargs):
                await queue.put(None)

        def custom_builder(*args, **kwargs):
            kwargs["extra_callbacks"] = [StreamCallback()]
            return build_agent_with_model(*args, **kwargs)

        task = asyncio.create_task(runner(request, custom_builder, actor))
        
        streamed_text = ""
        while not task.done() or not queue.empty():
            try:
                token = await asyncio.wait_for(queue.get(), timeout=0.1)
                if token is not None:
                    streamed_text += token
                    yield _jsonl_event("chunk", content=token)
            except asyncio.TimeoutError:
                pass

        result = await task
        final_text = str(result.get("response") or "")
        
        is_tool_call_stream = _parse_raw_tool_call(streamed_text) is not None
        
        if is_tool_call_stream or ("### 📄" in final_text) or ("Tool Executed:" in final_text):
            yield _jsonl_event("replace", content=final_text)
        elif final_text.startswith(streamed_text):
            remainder = final_text[len(streamed_text):]
            if remainder:
                async for chunk in _stream_text_chunks(remainder):
                    yield chunk
        else:
            if streamed_text not in final_text:
                yield _jsonl_event("replace", content=final_text)
            else:
                remainder = final_text.split(streamed_text)[-1]
                if remainder:
                    async for chunk in _stream_text_chunks(remainder):
                        yield chunk

        yield _jsonl_event("end", mode=result.get("mode"))

    except HTTPException as exc:
        yield _jsonl_event("error", detail=str(exc.detail), status=exc.status_code)
    except Exception as exc:
        yield _jsonl_event("error", detail=str(exc), status=500)


# =========================================================
# Router Factory
# =========================================================

def create_agent_router(
    build_agent_with_model: Callable[..., Any]
) -> APIRouter:
    router = APIRouter()

    # -----------------------------------------------------
    # Standard Query Endpoint
    # -----------------------------------------------------

    @router.post("/agent/query")
    async def query(
        request: PlaygroundQueryRequest,
        actor: dict[str, Any] = Depends(get_request_actor),
    ) -> Dict[str, Any]:
        try:
            return await _run_agent_query(request, build_agent_with_model, actor)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Agent execution failed: {exc}",
            ) from exc

    @router.post("/agent/query/stream")
    async def query_stream(
        request: PlaygroundQueryRequest,
        actor: dict[str, Any] = Depends(get_request_actor),
    ) -> StreamingResponse:
        return StreamingResponse(
            _stream_agent_query(
                request,
                build_agent_with_model,
                direct_instructions="Answer directly without tools.",
                runner=_run_agent_query,
                actor=actor,
            ),
            media_type="application/x-ndjson",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )

    # -----------------------------------------------------
    # Models Endpoint
    # -----------------------------------------------------

    @router.get("/agent/models")
    async def list_models(
        actor: dict[str, Any] = Depends(get_request_actor),
    ) -> Dict[str, Any]:
        try:
            discovered_models = await fetch_available_models()
            default_mod = await get_default_model()

            return {
                "models": discovered_models,
                "default_model": default_mod,
            }
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to fetch models: {exc}",
            ) from exc

    # -----------------------------------------------------
    # Playground Query Endpoint
    # -----------------------------------------------------

    @router.post("/agent/playground/query")
    async def playground_query(
        request: PlaygroundQueryRequest,
        actor: dict[str, Any] = Depends(get_request_actor),
    ) -> Dict[str, Any]:
        try:
            return await _run_playground_query(request, build_agent_with_model, actor)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Playground agent failed: {exc}",
            ) from exc

    @router.post("/agent/playground/query/stream")
    async def playground_query_stream(
        request: PlaygroundQueryRequest,
        actor: dict[str, Any] = Depends(get_request_actor),
    ) -> StreamingResponse:
        return StreamingResponse(
            _stream_agent_query(
                request,
                build_agent_with_model,
                direct_instructions="Answer directly.",
                runner=_run_playground_query,
                actor=actor,
            ),
            media_type="application/x-ndjson",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )

    return router
