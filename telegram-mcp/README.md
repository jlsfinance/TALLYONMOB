# Telegram MCP Server

This server allows AI agents to interact with Telegram.

## Setup

1. Get a Bot Token from [@BotFather](https://t.me/BotFather).
2. Install `uv` if you haven't:
   ```powershell
   powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
   ```
3. Update your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "telegram-mcp": {
      "command": "uv",
      "args": [
        "--directory",
        "d:/New folder (2)/telegram-mcp",
        "run",
        "main.py"
      ],
      "env": {
        "TELEGRAM_BOT_TOKEN": "YOUR_ACTUAL_BOT_TOKEN"
      }
    }
  }
}
```

4. Restart Claude Desktop.
