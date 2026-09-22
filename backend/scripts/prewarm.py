"""
prewarm.py

Keep-alive and pre-warming utility for DAAZLING cloud deployments.
Pings backend API health and persona endpoints on a regular interval
to prevent container spin-down on free/sleep-tier hosts (Render, Koyeb, Railway).

Usage:
  python backend/scripts/prewarm.py --url https://your-backend.onrender.com
  python backend/scripts/prewarm.py --url http://localhost:8000 --once
"""
import argparse
import os
import sys
import time
from datetime import datetime

try:
    import httpx
except ImportError:
    print("[ERROR] httpx is required. Run 'pip install httpx'.")
    sys.exit(1)

def ping_endpoint(client: httpx.Client, base_url: str, endpoint: str) -> bool:
    url = f"{base_url.rstrip('/')}{endpoint}"
    start_time = time.time()
    try:
        response = client.get(url, timeout=15.0)
        latency_ms = (time.time() - start_time) * 1000
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        if response.status_code == 200:
            print(f"[{timestamp}] [OK] {endpoint} - Status: 200 ({latency_ms:.1f}ms)")
            return True
        else:
            print(f"[{timestamp}] [WARN] {endpoint} - Status: {response.status_code} ({latency_ms:.1f}ms)")
            return False
    except Exception as e:
        latency_ms = (time.time() - start_time) * 1000
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}] [FAIL] {endpoint} - Exception: {e} ({latency_ms:.1f}ms)")
        return False

def main():
    parser = argparse.ArgumentParser(description="DAAZLING Backend Pre-Warm & Keep-Alive Daemon")
    parser.add_argument("--url", default=os.getenv("TARGET_API_URL", "http://localhost:8000"), help="Base URL of backend API")
    parser.add_argument("--interval", type=int, default=840, help="Interval between pings in seconds (default: 840s / 14m)")
    parser.add_argument("--once", action="store_true", help="Ping once and exit (for cron jobs / CI triggers)")
    args = parser.parse_args()

    print(f"=== DAAZLING Pre-Warm Daemon Started ===")
    print(f"Target Base URL : {args.url}")
    print(f"Ping Interval   : {args.interval}s")
    print(f"Single Shot     : {args.once}")
    print("========================================\n")

    with httpx.Client() as client:
        while True:
            h_ok = ping_endpoint(client, args.url, "/health")
            p_ok = ping_endpoint(client, args.url, "/api/personas")

            if args.once:
                sys.exit(0 if (h_ok or p_ok) else 1)

            time.sleep(args.interval)

if __name__ == "__main__":
    main()
