"""
run_server.py

Unified process runner for single-container cloud environments.
Launches both FastAPI (Uvicorn) and the LiveKit Voice Agent Worker concurrently.
Handles graceful shutdown upon receiving SIGTERM or SIGINT.
"""
import os
import signal
import subprocess
import sys
import time

def main():
    port = os.environ.get("PORT", "8000")
    host = os.environ.get("HOST", "0.0.0.0")
    run_worker = os.environ.get("RUN_LIVEKIT_WORKER", "true").lower() in ("true", "1", "yes")

    processes = []

    def shutdown(sig, frame):
        print(f"\n[Supervisor] Caught signal {sig}, terminating child processes...")
        for p in processes:
            if p.poll() is None:
                p.terminate()
        time.sleep(1)
        for p in processes:
            if p.poll() is None:
                p.kill()
        sys.exit(0)

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    # 1. Start FastAPI API Web Server
    api_cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        "main:app",
        "--host",
        host,
        "--port",
        str(port),
    ]
    print(f"[Supervisor] Launching FastAPI API server on {host}:{port}...")
    api_proc = subprocess.Popen(api_cmd)
    processes.append(api_proc)

    # 2. Optionally start LiveKit Voice Agent Worker
    if run_worker and os.environ.get("LIVEKIT_URL"):
        print("[Supervisor] LIVEKIT_URL detected. Launching LiveKit Worker Agent...")
        worker_cmd = [sys.executable, "agent.py", "start"]
        worker_proc = subprocess.Popen(worker_cmd)
        processes.append(worker_proc)
    else:
        print("[Supervisor] LiveKit Worker disabled or LIVEKIT_URL not set.")

    # 3. Supervise processes
    while True:
        for p in processes:
            ret = p.poll()
            if ret is not None:
                print(f"[Supervisor] Process {p.args} exited with code {ret}. Shutting down supervisor...")
                shutdown(signal.SIGTERM, None)
        time.sleep(2)

if __name__ == "__main__":
    main()
