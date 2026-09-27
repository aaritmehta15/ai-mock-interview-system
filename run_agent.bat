@echo off
title DAAZLING LiveKit Voice Agent Worker
echo ===================================================
echo Starting DAAZLING LiveKit Real-time Voice Agent...
echo Connecting to LiveKit Cloud WebRTC infrastructure...
echo ===================================================
cd /d "%~dp0backend"
if exist venv\Scripts\python.exe (
    venv\Scripts\python.exe agent.py start
) else (
    python agent.py start
)
pause
