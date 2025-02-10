#!/bin/bash

# Store process IDs
declare -a PIDS=()

# Color and emoji definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Server emojis
CAPTIONS_EMOJI="🎬"
FLASH_EMOJI="⚡"
MOCK_CLIENT_EMOJI="🎭"
CLOUD_EMOJI="☁️"

# Function to handle errors
handle_error() {
    echo -e "${RED}Error: $1${NC}"
    kill_all_processes
    exit 1
}

# Function to kill all running processes
kill_all_processes() {
    echo -e "\n${YELLOW}Shutting down all servers...${NC}"
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null
        fi
    done
    # Kill any remaining bun processes (backup cleanup)
    pkill -f "bun run dev" 2>/dev/null
    echo -e "${GREEN}All servers stopped${NC}"
}

# Function to run installation and start server in a directory
setup_and_run() {
    local dir=$1
    local emoji=$2
    local color=$3
    
    echo -e "${color}Setting up $dir...${NC}"
    
    # Change to directory
    cd "$dir" || handle_error "Failed to change to $dir directory"
    
    # Install dependencies
    echo -e "${color}Installing dependencies for $dir...${NC}"
    FORCE_COLOR=1 bun i 2>&1 | sed "s/^/$emoji /" || handle_error "Failed to install dependencies in $dir"
    
    # Start the server in the background with prefix for logs
    echo -e "${color}Starting server for $dir...${NC}"
    FORCE_COLOR=1 bun run dev 2>&1 | sed "s/^/$emoji /" &
    PIDS+=($!)
    
    # Change back to parent directory
    cd "$ROOT_DIR"
}

# Store the root directory
ROOT_DIR=$(pwd)

# Check if directories exist
for dir in "captions" "flash" "../augmentos_mock_client" "../augmentos_cloud"; do
    if [ ! -d "$dir" ]; then
        handle_error "$dir directory not found"
    fi
done

# Clear the terminal for a clean start
clear

# Print startup banner
echo -e "${GREEN}=== Starting AugmentOS Development Environment ===${NC}\n"

# Setup trap to handle Ctrl+C and other termination signals
trap kill_all_processes EXIT INT TERM

# Run setup for all projects
setup_and_run "." "$CLOUD_EMOJI" "$RED"
setup_and_run "../augmentos_tpas/captions" "$CAPTIONS_EMOJI" "$BLUE"
setup_and_run "../augmentos_tpas/flash" "$FLASH_EMOJI" "$GREEN"
setup_and_run "../augmentos_mock_client" "$MOCK_CLIENT_EMOJI" "$YELLOW"

echo -e "\n${GREEN}All servers are now running!${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop all servers${NC}\n"

# Wait for all background processes
wait

# directory structure
# augmentos_examples
# ├── captions
# │   ├── package.json
# │   └── src
# │       └── index.js
# ├── flash
# │   ├── package.json
# │   └── src
# │       └── index.js
# augmentos_mock_client
# │   ├── package.json
# │   └── src
# │       └── index.js
# │
# augmentos_cloud
# │    ├──run.sh
# │    ├── package.json
# │    └── src
# │        └── index.js
