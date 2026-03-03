import logging
import os
from typing import Any, Dict, Optional

import httpx
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("Telegram")
TELEGRAM_API_BASE = "https://api.telegram.org"

# Avoid leaking token-bearing URLs in verbose HTTP client logs.
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)


def _get_token() -> Optional[str]:
    token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    return token or None


def _method_url(method: str) -> Optional[str]:
    token = _get_token()
    if not token:
        return None
    return f"{TELEGRAM_API_BASE}/bot{token}/{method}"


async def _telegram_request(method: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    url = _method_url(method)
    if not url:
        return {"ok": False, "error": "TELEGRAM_BOT_TOKEN environment variable not set."}

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            if payload is None:
                response = await client.get(url)
            else:
                response = await client.post(url, json=payload)
    except httpx.RequestError as exc:
        return {"ok": False, "error": f"Network error: {exc}"}
    except Exception as exc:
        return {"ok": False, "error": f"Unexpected error: {exc}"}

    try:
        body = response.json()
    except Exception:
        body = {"description": response.text}

    if response.status_code != 200:
        return {
            "ok": False,
            "status_code": response.status_code,
            "description": body.get("description") if isinstance(body, dict) else str(body),
            "raw": body,
        }

    if isinstance(body, dict):
        return body
    return {"ok": False, "error": "Unexpected Telegram response.", "raw": body}


@mcp.tool()
async def validate_telegram_setup() -> Dict[str, Any]:
    """Validate token + connectivity by calling Telegram getMe."""
    token = _get_token()
    if not token:
        return {
            "ok": False,
            "token_present": False,
            "error": "TELEGRAM_BOT_TOKEN is missing from MCP server env.",
        }

    result = await _telegram_request("getMe")
    if result.get("ok"):
        return {
            "ok": True,
            "token_present": True,
            "bot": result.get("result"),
        }

    return {
        "ok": False,
        "token_present": True,
        "error": result.get("description") or result.get("error") or "Unknown error",
        "raw": result,
    }


@mcp.tool()
async def send_telegram_message(chat_id: str, text: str, parse_mode: Optional[str] = None) -> Dict[str, Any]:
    """
    Send a message to a Telegram chat, group, or channel.
    parse_mode is optional (Markdown, MarkdownV2, HTML).
    """
    chat_id = (chat_id or "").strip()
    text = (text or "").strip()

    if not chat_id:
        return {"ok": False, "error": "chat_id is required."}
    if not text:
        return {"ok": False, "error": "text is required."}

    payload: Dict[str, Any] = {"chat_id": chat_id, "text": text}
    if parse_mode:
        payload["parse_mode"] = parse_mode

    result = await _telegram_request("sendMessage", payload)
    if result.get("ok"):
        return {
            "ok": True,
            "chat_id": chat_id,
            "message_id": result.get("result", {}).get("message_id"),
        }

    # Common Telegram issue: parse mode errors. Retry once without parse mode.
    description = str(result.get("description") or result.get("error") or "")
    if parse_mode and ("parse" in description.lower() or "entities" in description.lower()):
        payload.pop("parse_mode", None)
        retry = await _telegram_request("sendMessage", payload)
        if retry.get("ok"):
            return {
                "ok": True,
                "chat_id": chat_id,
                "message_id": retry.get("result", {}).get("message_id"),
                "warning": "Message sent after removing parse_mode.",
            }

    return {
        "ok": False,
        "error": description or "Failed to send Telegram message.",
        "raw": result,
    }


@mcp.tool()
async def get_recent_updates(limit: int = 10) -> Dict[str, Any]:
    """
    Fetch recent updates to help discover valid chat IDs.
    Tip: message your bot first (/start), then call this tool.
    """
    if limit < 1:
        limit = 1
    if limit > 100:
        limit = 100

    result = await _telegram_request("getUpdates", {"limit": limit, "timeout": 0})
    if not result.get("ok"):
        return {
            "ok": False,
            "error": result.get("description") or result.get("error") or "getUpdates failed.",
            "raw": result,
        }

    updates = result.get("result", []) or []
    chats = []
    seen = set()

    for update in updates:
        for key in ("message", "edited_message", "channel_post", "edited_channel_post"):
            msg = update.get(key)
            if not isinstance(msg, dict):
                continue
            chat = msg.get("chat", {})
            chat_id = chat.get("id")
            if chat_id is None:
                continue
            chat_key = str(chat_id)
            if chat_key in seen:
                continue
            seen.add(chat_key)
            chats.append(
                {
                    "chat_id": chat_key,
                    "type": chat.get("type"),
                    "title": chat.get("title") or chat.get("username") or chat.get("first_name"),
                }
            )

    return {"ok": True, "update_count": len(updates), "chats": chats}


@mcp.tool()
async def get_bot_details() -> Dict[str, Any]:
    """Get details about the configured Telegram bot."""
    result = await _telegram_request("getMe")
    if result.get("ok"):
        return {"ok": True, "bot": result.get("result")}
    return {
        "ok": False,
        "error": result.get("description") or result.get("error") or "getMe failed.",
        "raw": result,
    }


if __name__ == "__main__":
    mcp.run()
