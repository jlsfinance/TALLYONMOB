import os
import asyncio
from mcp.server.fastmcp import FastMCP
import httpx

# Create an MCP server named "Telegram"
mcp = FastMCP("Telegram")

@mcp.tool()
async def send_telegram_message(chat_id: str, text: str):
    """
    Send a message to a Telegram chat, group, or channel.
    To get your chat_id, message @userinfobot on Telegram.
    """
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not token:
        return "Error: TELEGRAM_BOT_TOKEN environment variable not set in MCP config."
    
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "Markdown"
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, timeout=10.0)
            if response.status_code == 200:
                return f"✅ Message sent successfully to Chat ID: {chat_id}"
            else:
                return f"❌ Failed to send message (HTTP {response.status_code}): {response.text}"
    except Exception as e:
        return f"⚠️ Exception occurred while sending message: {str(e)}"

@mcp.tool()
async def get_bot_details():
    """Get details about the configured Telegram bot."""
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not token:
        return "Error: TELEGRAM_BOT_TOKEN not set."
        
    url = f"https://api.telegram.org/bot{token}/getMe"
    async with httpx.AsyncClient() as client:
        response = await client.get(url)
        return response.json()

if __name__ == "__main__":
    mcp.run()
