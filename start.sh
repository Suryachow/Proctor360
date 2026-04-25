#!/bin/bash

# Proctor360 - Linux/Ubuntu Development Launcher
# This script is the Linux equivalent of start.bat

# Color codes for better visibility
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================================${NC}"
echo -e "${GREEN}  PROCTOR360 ENTERPRISE AI - Linux Launcher${NC}"
echo -e "${BLUE}======================================================${NC}"

# Get absolute path of the script directory
ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Check for python3
if ! command -v python3 &> /dev/null; then
    echo -e "${YELLOW}Warning: python3 not found. Trying 'python'...${NC}"
    PYTHON_CMD="python"
else
    PYTHON_CMD="python3"
fi

# 1. API Server (FastAPI) on port 8000
echo -e "${BLUE}[1/4] Starting API Server on port 8000...${NC}"
cd "$ROOT/services/api" && $PYTHON_CMD -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
API_PID=$!
sleep 2

# 2. AI Engine on port 8100
echo -e "${BLUE}[2/4] Starting AI Engine on port 8100...${NC}"
cd "$ROOT/services/ai-engine" && $PYTHON_CMD -m uvicorn app.main:app --host 0.0.0.0 --port 8100 --reload &
AI_PID=$!
sleep 2

# 3. Student Portal (Vite) on port 5173
echo -e "${BLUE}[3/4] Starting Student Portal on port 5173...${NC}"
cd "$ROOT/apps/student-portal" && npm run dev &
STUDENT_PID=$!
sleep 2

# 4. Admin Dashboard (Vite) on port 5174
echo -e "${BLUE}[4/4] Starting Admin Dashboard on port 5174...${NC}"
cd "$ROOT/apps/admin-dashboard" && npm run dev &
ADMIN_PID=$!

echo -e "\n${GREEN}======================================================${NC}"
echo -e "  All services launched in background!"
echo -e "${GREEN}======================================================${NC}"
echo -e "  API Server:        http://localhost:8000"
echo -e "  AI Engine:         http://localhost:8100"
echo -e "  Student Portal:    http://localhost:5173"
echo -e "  Admin Dashboard:   http://localhost:5174"
echo -e "\n  ${YELLOW}Press Ctrl+C to stop all services...${NC}"

# Cleanup function to kill all background processes on exit
cleanup() {
    echo -e "\n${YELLOW}Stopping all services...${NC}"
    kill $API_PID $AI_PID $STUDENT_PID $ADMIN_PID 2>/dev/null
    exit
}

# Trap SIGINT (Ctrl+C)
trap cleanup SIGINT

# Keep the script running to monitor background processes
wait
