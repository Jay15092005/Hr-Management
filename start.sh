#!/bin/bash

# ============================================
# HR Management - Start Script
# ============================================
# This script starts both the frontend and AI agent

echo "============================================"
echo "🚀 HR Management System - Starting..."
echo "============================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}Stopping all services...${NC}"
    
    # Kill all child processes
    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null
        echo -e "${RED}Frontend stopped${NC}"
    fi
    
    if [ ! -z "$AGENT_PID" ]; then
        kill $AGENT_PID 2>/dev/null
        echo -e "${RED}AI Agent stopped${NC}"
    fi
    
    # Kill any remaining background jobs
    jobs -p | xargs -r kill 2>/dev/null
    
    echo -e "${GREEN}All services stopped. Goodbye!${NC}"
    exit 0
}

# Set up trap to cleanup on Ctrl+C or exit
trap cleanup SIGINT SIGTERM EXIT

# ============================================
# Start Frontend (React/Vite)
# ============================================
echo ""
echo -e "${BLUE}📦 Starting Frontend (React/Vite)...${NC}"
cd "$SCRIPT_DIR"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing frontend dependencies...${NC}"
    npm install
fi

# Start frontend in background
npm run dev &
FRONTEND_PID=$!
echo -e "${GREEN}✅ Frontend started (PID: $FRONTEND_PID)${NC}"
echo -e "${GREEN}   → http://localhost:5173${NC}"

# Wait a moment for frontend to start
sleep 2

# ============================================
# Start AI Agent (Python)
# ============================================
echo ""
echo -e "${BLUE}🤖 Starting AI Interview Agent...${NC}"
cd "$SCRIPT_DIR/ai-agent"

# Python venv path: Windows uses Scripts, macOS/Linux use bin
if [ -f "venv/Scripts/python" ]; then
    VENV_PYTHON="venv/Scripts/python"
    VENV_ACTIVATE="venv/Scripts/activate"
else
    VENV_PYTHON="venv/bin/python"
    VENV_ACTIVATE="venv/bin/activate"
fi

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}Creating Python virtual environment (Python 3.12)...${NC}"
    if command -v py >/dev/null 2>&1; then
        py -3.12 -m venv venv || py -3 -m venv venv || py -m venv venv
    else
        python3.12 -m venv venv || python3 -m venv venv
    fi
    # Re-detect venv paths after creation
    if [ -f "venv/Scripts/python" ]; then
        VENV_PYTHON="venv/Scripts/python"
        VENV_ACTIVATE="venv/Scripts/activate"
    else
        VENV_PYTHON="venv/bin/python"
        VENV_ACTIVATE="venv/bin/activate"
    fi
    echo -e "${YELLOW}Installing AI Agent dependencies...${NC}"
    source "$VENV_ACTIVATE"
    "$VENV_PYTHON" -m pip install -r requirements.txt
else
    source "$VENV_ACTIVATE"
    echo -e "${YELLOW}Checking AI Agent dependencies...${NC}"
    "$VENV_PYTHON" -m pip install -r requirements.txt
fi

# Check if .env exists (main.py also loads repo-root .env for SUPABASE_SERVICE_ROLE_KEY, etc.)
if [ ! -f ".env" ] && [ ! -f "$SCRIPT_DIR/.env" ]; then
    echo -e "${RED}⚠️  Warning: no .env in ai-agent/ or project root${NC}"
    echo -e "${YELLOW}   Add SUPABASE_SERVICE_ROLE_KEY (required for agent auto-join; see ai-agent/.env.example)${NC}"
fi

# Start AI agent in background (unbuffered stdout so poll logs appear under ./start.sh)
# Use the python executable from the venv directly to ensure correct environment
PYTHONUNBUFFERED=1 "$VENV_PYTHON" main.py &
AGENT_PID=$!
echo -e "${GREEN}✅ AI Agent started (PID: $AGENT_PID)${NC}"

# ============================================
# Status
# ============================================
echo ""
echo "============================================"
echo -e "${GREEN}🎉 All services running!${NC}"
echo "============================================"
echo ""
echo -e "  ${BLUE}Frontend:${NC}  http://localhost:5173"
echo -e "  ${BLUE}AI Agent:${NC}  Polling for interviews..."
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo "============================================"
echo ""

# Wait for both processes
wait
