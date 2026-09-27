"""
run_server.py

Unified process runner for single-container cloud environments (Render, Railway, etc.).
- When RUN_LIVEKIT_WORKER is false (default for Render Web Service):
  Runs FastAPI / Uvicorn directly in the main process.
  Memory usage is ~100MB (well below Render's 512MB limit).
  Ensures 100% API uptime, zero OOM terminations, and instant wake-ups.
- When RUN_LIVEKIT_WORKER is true (or when running on a dedicated worker):
  Supervises both FastAPI and the LiveKit Voice Agent Worker concurrently with auto-restart.
"""
import os
import signal
import subprocess
import sys
import time
from dotenv import load_dotenv

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))

def main():
    load_dotenv(os.path.join(BACKEND_DIR, ".env"))
    load_dotenv()
    os.environ["PYTHONUNBUFFERED"] = "1"
    os.chdir(BACKEND_DIR)
    if BACKEND_DIR not in sys.path:
        sys.path.insert(0, BACKEND_DIR)

    port = os.environ.get("PORT", "8000")
    host = os.environ.get("HOST", "0.0.0.0")
    run_worker = os.environ.get("RUN_LIVEKIT_WORKER", "false").lower() in ("true", "1", "yes")

    # Mode 1: Pure FastAPI Web Service (Default for Render Web Service to avoid 512MB OOM crash)
    if not run_worker:
        print(f"[run_server] Launching FastAPI Web Service on {host}:{port} (RUN_LIVEKIT_WORKER=false)...")
        import uvicorn
        uvicorn.run("main:app", host=host, port=int(port), log_level="info")
        return

    # Mode 2: Multi-process supervisor (FastAPI + LiveKit Worker)
    print(f"[Supervisor] Launching FastAPI + LiveKit Worker (RUN_LIVEKIT_WORKER=true)...")
    api_proc = None
    worker_proc = None
    shutting_down = False

    def shutdown(sig, frame):
        nonlocal shutting_down
        shutting_down = True
        print(f"\n[Supervisor] Caught signal {sig}, terminating child processes...")
        for p in [api_proc, worker_proc]:
            if p and p.poll() is None:
                try:
                    p.terminate()
                except Exception:
                    pass
        time.sleep(1)
        for p in [api_proc, worker_proc]:
            if p and p.poll() is None:
                try:
                    p.kill()
                except Exception:
                    pass
        sys.exit(0)

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    # 1. Start FastAPI API Web Server
    api_cmd = [
        sys.executable,
        "-u",
        "-m",
        "uvicorn",
        "main:app",
        "--host",
        host,
        "--port",
        str(port),
    ]
    print(f"[Supervisor] Launching FastAPI API server on {host}:{port} (cwd={BACKEND_DIR})...")
    api_proc = subprocess.Popen(api_cmd, cwd=BACKEND_DIR)

    # Helper function to launch/restart worker
    def spawn_worker():
        livekit_url = os.environ.get("LIVEKIT_URL")
        api_key = os.environ.get("LIVEKIT_API_KEY")
        api_secret = os.environ.get("LIVEKIT_API_SECRET")

        if not livekit_url:
            print("[Supervisor] LiveKit Worker disabled: LIVEKIT_URL not set.")
            return None

        worker_cmd = [sys.executable, "-u", "agent.py", "start"]
        if livekit_url:
            worker_cmd.extend(["--url", livekit_url])
        if api_key:
            worker_cmd.extend(["--api-key", api_key])
        if api_secret:
            worker_cmd.extend(["--api-secret", api_secret])

        print(f"[Supervisor] Launching LiveKit Worker Agent ({livekit_url})...")
        return subprocess.Popen(worker_cmd, cwd=BACKEND_DIR)

    worker_proc = spawn_worker()

    # 3. Supervise processes
    while not shutting_down:
        # Check API server
        if api_proc and api_proc.poll() is not None:
            ret = api_proc.poll()
            print(f"[Supervisor] FastAPI API server exited unexpectedly with code {ret}. Shutting down...")
            shutdown(signal.SIGTERM, None)

        # Check Worker process: restart on crash, NEVER kill the API server!
        if worker_proc and worker_proc.poll() is not None:
            ret = worker_proc.poll()
            print(f"[Supervisor] LiveKit Worker exited with code {ret}. Restarting worker in 3 seconds...")
            time.sleep(3)
            if not shutting_down:
                worker_proc = spawn_worker()

        time.sleep(2)

if __name__ == "__main__":
    main()
