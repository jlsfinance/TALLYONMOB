# Telegram MCP Server

This MCP server lets agents send Telegram messages and run Telegram bot diagnostics.

## What this server can do

- `validate_telegram_setup`: confirms token + Telegram API access (`getMe`)
- `get_bot_details`: fetches configured bot info
- `get_recent_updates`: helps discover chat IDs from recent bot updates
- `send_telegram_message`: sends a message (optional `parse_mode`)

## Prerequisites (Windows)

1. Install `uv`:

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

2. Verify install:

```powershell
uv --version
```

If `uv` is not recognized, restart terminal/IDE after install.

## MCP config example

Add this to your MCP client config:

```json
{
  "mcpServers": {
    "telegram-mcp": {
      "command": "uv",
      "args": [
        "--directory",
        "d:/New folder (2)/telegram-mcp",
        "run",
        "--no-project",
        "--with",
        "mcp[cli]>=0.1.0",
        "--with",
        "httpx>=0.27.0",
        "main.py"
      ],
      "env": {
        "TELEGRAM_BOT_TOKEN": "123456789:YOUR_REAL_BOT_TOKEN"
      }
    }
  }
}
```

Then restart your MCP client.

## Quick debug flow

1. Run `validate_telegram_setup`
2. If valid, message your bot in Telegram (`/start`)
3. Run `get_recent_updates` to get correct `chat_id`
4. Run `send_telegram_message` with that `chat_id`

## Common failures

- `TELEGRAM_BOT_TOKEN` missing: token was not provided in MCP server `env`
- `401 Unauthorized`: token is wrong/revoked (regenerate in @BotFather)
- `400 chat not found`: wrong chat ID, or bot not added to chat/channel
- Markdown parse errors: send without `parse_mode`, or escape Markdown characters

