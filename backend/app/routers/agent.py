from __future__ import annotations

import asyncio
import json
import re
from typing import Any, Callable, Optional, List, Dict, Tuple
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import httpx
from mcp_use import MCPClient
from pydantic import BaseModel
from sqlalchemy import select

from app.core.db import SessionLocal
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


async def _list_combined_tool_names() -> List[str]:
    try:
        catalog = _list_exposed_tool_catalog()
        tool_names = sorted({str(item.get("name", "")).strip() for item in catalog if str(item.get("name", "")).strip()})
        if tool_names:
            return tool_names
    except Exception as exc:
        logger.warning(f"Could not fetch catalog tools from DB: {exc}")

    client = _build_mcp_client()
    try:
        await client.create_all_sessions(auto_initialize=True)
        session = client.get_session(ENV.agent_mcp_server_name)
        if session is None:
            return []
        tools = await session.list_tools()
        return sorted({tool.name for tool in tools})
    except Exception as exc:
        logger.warning(f"Fallback MCPClient tool list failed: {exc}")
        return []
    finally:
        if hasattr(client, "aclose"):
            await client.aclose()
        elif hasattr(client, "close"):
            close_fn = getattr(client, "close")
            if callable(close_fn):
                close_fn()


# =========================================================
# Database Utilities
# =========================================================

def _list_exposed_tool_catalog() -> List[Dict[str, Any]]:
    """
    Returns tool metadata grouped by application from DB.
    """
    db = SessionLocal()
    try:
        tools_list, _ = resolve_exposable_tools(
            db,
            MCPToolModel,
            AccessPolicyModel,
            ServerModel,
            BaseURLModel,
            public_only=False,
        )
        if not tools_list:
            tools = db.scalars(
                select(MCPToolModel).where(
                    MCPToolModel.is_deleted == False,
                    MCPToolModel.admin_enabled == True,
                    MCPToolModel.owner_enabled == True,
                )
            ).all()
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


# =========================================================
# Prompt & Model Utilities
# =========================================================

def _normalize_model(model: Optional[str]) -> str:
    if model and model.strip():
        return model.strip()
    return ENV.agent_ollama_model or "gemma4:31b-cloud"


def _build_tool_only_instructions(selected_tools: List[str]) -> str:
    """
    Bullet list format tokenizes better than comma-separated lists.
    """
    if not selected_tools:
        return (
            "You have no tools available. "
            "Answer directly using your knowledge."
        )

    lines = "\n".join(f"- {tool}" for tool in selected_tools)
    logger.warning("List of available tools: %s", lines)

    return (
        "You are an MCP tool-using agent.\n"
        "Use the provided tools whenever they are relevant to answer the user's request.\n"
        "Before calling a tool, you MUST wrap your reasoning inside <think>...</think> tags. "
        "To execute a tool, output exactly ONE JSON block in this format to call a tool:\n"
        "```json\n"
        '{"name": "<tool_name>", "arguments": {}}\n'
        "```\n"
        "Do not hallucinate tool results. Call the tool first, and wait for the system to return the result.\n"
        "Only the following tools are available:\n"
        f"{lines}\n"
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


def _parse_raw_tool_call(text: Any) -> Optional[Tuple[str, Dict[str, Any]]]:
    if not isinstance(text, str):
        return None

    candidate = text.strip()
    
    # Extract json block if present
    import re
    import json
    
    # Try to find ```json ... ``` block
    match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', candidate, re.DOTALL)
    if match:
        candidate = match.group(1).strip()
    else:
        # Fallback: try to find any { "name": ... } block
        match = re.search(r'(\{.*?"name"\s*:.*?\})', candidate, re.DOTALL)
        if match:
            candidate = match.group(1).strip()

    try:
        payload = json.loads(candidate)
        if isinstance(payload, dict) and "name" in payload:
            name = str(payload.get("name") or "").strip()
            args = payload.get("parameters") or payload.get("arguments") or {}
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

    sections: List[str] = []

    clean_tool_title = tool_name.replace("app__", "").replace("mcp__", "").replace("__", " ").replace("_", " ").title()
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
) -> Optional[str]:
    parsed = _parse_raw_tool_call(result_text)
    if parsed is None:
        return None

    tool_name, arguments = parsed
    if tool_name not in set(allowed_tools):
        return None

    try:
        tool_result = await call_server_tool(
            ENV.agent_mcp_server_name,
            ENV.agent_mcp_server_url,
            tool_name,
            arguments,
            timeout_sec=30.0,
        )
    except Exception as exc:
        logger.warning(f"call_server_tool failed ({exc}), attempting direct combined_apps_mcp call")
        try:
            from app.main import combined_apps_mcp
            res = await combined_apps_mcp.call_tool(tool_name, arguments)
            tool_result = getattr(res, "structured_content", res)
        except Exception as inner_exc:
            return f"Error executing tool '{tool_name}': {inner_exc}"

    return _format_tool_result_human_readable(tool_name, arguments, tool_result)


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
) -> Dict[str, Any]:
    model = _normalize_model(request.model)
    effective_prompt = _effective_prompt(request)

    if _is_capability_prompt(request.prompt):
        all_tools = await _list_combined_tool_names()
        catalog = _list_exposed_tool_catalog()
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

    all_tools = await _list_combined_tool_names()

    if not all_tools:
        result = await generate_direct_response(
            effective_prompt,
            model=model,
            additional_instructions="Answer directly and naturally. Note: No active tools are registered in the MCP manager yet.",
        )
        return {"response": result, "mode": "direct_llm"}

    if _is_tool_inventory_prompt(request.prompt):
        catalog = _list_exposed_tool_catalog()
        return {
            "response": _build_tool_inventory_response_from_catalog(
                catalog,
                all_tools,
                include_descriptions=_wants_descriptions(request),
            ),
            "mode": "tool_inventory",
        }

    selected_tools = _select_relevant_tools(
        effective_prompt,
        all_tools,
        max_tools=12,
    )

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
        result = await agent.run(effective_prompt)
        rescued = await _maybe_execute_raw_tool_call(result, selected_tools)
        if rescued is not None:
            result = rescued
        else:
            result = _append_tool_usage_note(result, agent)
    except Exception as exc:
        logger.warning(f"MCPAgent execution failed ({exc}), falling back to direct LLM response")
        result = await generate_direct_response(
            effective_prompt,
            model=model,
            additional_instructions=instructions,
        )

    return {"response": result, "mode": "mcp_agent"}


async def _run_playground_query(
    request: PlaygroundQueryRequest,
    build_agent_with_model: Callable[..., Any],
) -> Dict[str, Any]:
    model = _normalize_model(request.model)

    effective_prompt = _effective_prompt(request)

    all_tools = await _list_combined_tool_names()

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
        catalog = _list_exposed_tool_catalog()
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
        catalog = _list_exposed_tool_catalog()
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
        result = await agent.run(effective_prompt)
        rescued = await _maybe_execute_raw_tool_call(result, selected_tools)
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
        rescued = await _maybe_execute_raw_tool_call(raw_direct, selected_tools)
        result = rescued if rescued is not None else raw_direct

    return {"response": result, "mode": "mcp_agent"}


async def _stream_agent_query(
    request: PlaygroundQueryRequest,
    build_agent_with_model: Callable[..., Any],
    *,
    direct_instructions: str,
    runner: Callable[[PlaygroundQueryRequest, Callable[..., Any]], Any],
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

        task = asyncio.create_task(runner(request, custom_builder))
        
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
        
        if final_text.startswith(streamed_text):
            remainder = final_text[len(streamed_text):]
            if remainder:
                async for chunk in _stream_text_chunks(remainder):
                    yield chunk
        else:
            # If the final text was modified in a way that doesn't match the stream exactly
            # We just append the missing parts or the whole thing if it's completely different
            if streamed_text not in final_text:
                async for chunk in _stream_text_chunks("\n\n" + final_text):
                    yield chunk
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
    async def query(request: PlaygroundQueryRequest) -> Dict[str, Any]:
        try:
            return await _run_agent_query(request, build_agent_with_model)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Agent execution failed: {exc}",
            ) from exc

    @router.post("/agent/query/stream")
    async def query_stream(request: PlaygroundQueryRequest) -> StreamingResponse:
        return StreamingResponse(
            _stream_agent_query(
                request,
                build_agent_with_model,
                direct_instructions="Answer directly without tools.",
                runner=_run_agent_query,
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
    async def list_models() -> Dict[str, Any]:
        base_url = (ENV.agent_ollama_base_url or "").rstrip("/")

        if not base_url:
            raise HTTPException(
                status_code=500,
                detail="Ollama base URL not configured",
            )

        try:
            async with httpx.AsyncClient(
                base_url=base_url,
                timeout=httpx.Timeout(5.0),
            ) as client:
                res = await client.get("/api/tags")

            if not res.is_success:
                raise HTTPException(
                    status_code=res.status_code,
                    detail="Failed to fetch Ollama models",
                )

            payload = res.json()
            models = [
                m.get("name")
                for m in payload.get("models", [])
                if m.get("name")
            ]

            return {
                "models": models,
                "default_model": ENV.agent_ollama_model,
            }

        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to reach Ollama server: {exc}",
            ) from exc

    # -----------------------------------------------------
    # Playground Query Endpoint
    # -----------------------------------------------------

    @router.post("/agent/playground/query")
    async def playground_query(
        request: PlaygroundQueryRequest,
    ) -> Dict[str, Any]:
        try:
            return await _run_playground_query(request, build_agent_with_model)
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
    ) -> StreamingResponse:
        return StreamingResponse(
            _stream_agent_query(
                request,
                build_agent_with_model,
                direct_instructions="Answer directly.",
                runner=_run_playground_query,
            ),
            media_type="application/x-ndjson",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )

    return router
