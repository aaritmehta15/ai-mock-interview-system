"""
tests/test_infra.py — Verify LiveKit, Gemini, and LangGraph Infrastructure
"""
import os
import asyncio
from dotenv import load_dotenv

load_dotenv()

async def test_livekit_token():
    from livekit import api
    url = os.getenv("LIVEKIT_URL")
    api_key = os.getenv("LIVEKIT_API_KEY")
    api_secret = os.getenv("LIVEKIT_API_SECRET")
    
    assert url, "LIVEKIT_URL is missing"
    assert api_key, "LIVEKIT_API_KEY is missing"
    assert api_secret, "LIVEKIT_API_SECRET is missing"

    token = (
        api.AccessToken(api_key, api_secret)
        .with_identity("test-candidate")
        .with_name("Candidate Tester")
        .with_grants(api.VideoGrants(room_join=True, room="test-room"))
        .to_jwt()
    )
    assert token and len(token) > 50, "Failed to generate valid JWT token"
    print(f"[OK] LiveKit Token generation OK (length: {len(token)})")

    # Test RoomServiceClient (converts wss:// to https://)
    http_url = url.replace("wss://", "https://").replace("ws://", "http://")
    client = api.LiveKitAPI(http_url, api_key, api_secret)
    try:
        rooms = await client.room.list_rooms(api.ListRoomsRequest())
        print(f"[OK] LiveKit Cloud Handshake OK - Connected to {url}! Active rooms: {len(rooms.rooms)}")
    finally:
        await client.aclose()

def test_imports():
    import pypdf
    import langgraph
    from livekit import agents
    from livekit.plugins import deepgram, silero
    print("[OK] Core imports OK (pypdf, langgraph, livekit.agents, deepgram, silero)")

if __name__ == "__main__":
    test_imports()
    asyncio.run(test_livekit_token())
    print("ALL INFRASTRUCTURE CHECKS PASSED!")
