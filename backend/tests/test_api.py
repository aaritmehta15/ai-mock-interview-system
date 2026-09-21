"""
tests/test_api.py — Integration tests for FastAPI endpoints
"""
import os
import sys
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import app

client = TestClient(app)

def test_health():
    res = client.get("/health")
    assert res.status_code == 200, f"Health check failed: {res.text}"
    assert res.json()["status"] == "ok"
    print("[OK] /health endpoint OK")

def test_token_endpoint():
    res = client.post("/api/token", json={
        "room_name": "interview-room-test",
        "participant_name": "Aarit Mehta"
    })
    assert res.status_code == 200, f"Token generation failed: {res.text}"
    data = res.json()
    assert "token" in data and len(data["token"]) > 50, "Missing valid JWT token"
    assert "url" in data and data["url"].startswith("wss://"), f"Invalid LiveKit URL: {data.get('url')}"
    print(f"[OK] /api/token endpoint OK (Token received for LiveKit Cloud room)")

def test_blueprint_endpoint():
    res = client.post("/api/blueprint", json={
        "company": "Amazon",
        "role": "SDE II",
        "seniority": "Mid-Level",
        "resume_text": "Experienced in Python, distributed databases, DynamoDB, AWS Lambda.",
        "jd_text": "Building large-scale backend systems for Amazon Web Services."
    })
    assert res.status_code == 200, f"Blueprint generation failed: {res.text}"
    data = res.json()
    assert data["company"] == "Amazon"
    assert len(data["questions"]) >= 3
    assert len(data["keywords"]) >= 3
    print(f"[OK] /api/blueprint endpoint OK (Generated {len(data['questions'])} questions, {len(data['keywords'])} keywords)")

if __name__ == "__main__":
    test_health()
    test_token_endpoint()
    test_blueprint_endpoint()
    print("ALL API ENDPOINT INTEGRATION TESTS PASSED! [OK]")
