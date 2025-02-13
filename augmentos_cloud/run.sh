#!/bin/bash

# Store process IDs
declare -a PIDS=()

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
PURPLE='\033[0;35m'  # Added new color for dashboard manager
NC='\033[0m' # No Color

# Function to create colored tag
create_tag() {
    local text=$1
    local color=$2
    # Using printf to avoid escape sequence issues
    printf "%b%b%s%b " "\033[1m" "$color" "$text" "\033[0m"
}

# Server tags with colors
CAPTIONS_TAG=$(create_tag "[TPA][captions]:" "$BLUE")
FLASH_TAG=$(create_tag "[TPA][flash]:" "$GREEN")
CLOUD_TAG=$(create_tag "[Backend]:" "$RED")
MOCK_CLIENT_TAG=$(create_tag "[Mock Client]:" "$YELLOW")
DASHBOARD_TAG=$(create_tag "[Dashboard]:" "$PURPLE")  # Added new tag

# Port definitions
CLOUD_PORT=7002
CAPTIONS_PORT=7010
FLASH_PORT=7011
VITE_PORT=5173
DASHBOARD_PORT=7012  # Added new port

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
    # Kill any remaining processes
    pkill -f "bun run dev" 2>/dev/null
    pkill -f "ts-node-dev" 2>/dev/null
    echo -e "${GREEN}All servers stopped${NC}"
}

# Function to check and free up a port if it's in use
free_up_port() {
    local port=$1
    local service=$2
    
    # Check if port is in use
    if lsof -i ":$port" >/dev/null 2>&1; then
        echo -e "${YELLOW}Port $port is currently in use by:${NC}"
        lsof -i ":$port"
        
        echo -e "${YELLOW}Attempting to free up port $port for $service...${NC}"
        # Kill the process using the port
        lsof -ti ":$port" | xargs kill -9 2>/dev/null
        
        # Wait a moment for the port to be freed
        sleep 2
        
        # Verify port is now free
        if lsof -i ":$port" >/dev/null 2>&1; then
            handle_error "Failed to free up port $port for $service"
        else
            echo -e "${GREEN}Successfully freed up port $port${NC}"
        fi
    fi
}

# Function to run installation and start server in a directory
setup_and_run() {
    local dir=$1
    local tag=$2
    local color=$3
    local port=$4
    local service_name=$5
    
    echo -e "${color}Setting up $dir...${NC}"
    
    # Free up port if needed
    if [ ! -z "$port" ]; then
        free_up_port "$port" "$service_name"
    fi
    
    # Change to directory
    cd "$dir" || handle_error "Failed to change to $dir directory"
    
    # Install dependencies
    echo -e "${color}Installing dependencies for $dir...${NC}"
    FORCE_COLOR=1 bun i 2>&1 | sed "s/^/$tag/" || handle_error "Failed to install dependencies in $dir"
    
    # Start the server in the background with prefix for logs
    echo -e "${color}Starting server for $dir...${NC}"
    
    # Set environment variables for the server
    export PORT=$port
    
    # Start the server and tag its output
    FORCE_COLOR=1 bun run dev 2>&1 | while IFS= read -r line; do
        printf "%s%s\n" "$tag" "$line"
    done &
    PIDS+=($!)
    
    # Change back to parent directory
    cd "$ROOT_DIR"
    
    # Small delay to allow server to start
    sleep 2
}

# Kill any existing processes on our ports before starting
for port in $CLOUD_PORT $CAPTIONS_PORT $FLASH_PORT $VITE_PORT $DASHBOARD_PORT; do
    free_up_port $port "Existing process"
done

# Store the root directory
ROOT_DIR=$(pwd)

# Check if directories exist
for dir in "./packages/cloud" "./packages/apps/flash" "./packages/apps/captions" "./packages/debugger" "./packages/apps/dashboard-manager"; do
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

# Run setup for all projects with their respective ports
setup_and_run "./packages/cloud" "$CLOUD_TAG" "$RED" "$CLOUD_PORT" "Cloud Server"
setup_and_run "./packages/apps/captions" "$CAPTIONS_TAG" "$BLUE" "$CAPTIONS_PORT" "Captions Server"
setup_and_run "./packages/apps/flash" "$FLASH_TAG" "$GREEN" "$FLASH_PORT" "Flash Server"
setup_and_run "./packages/debugger" "$MOCK_CLIENT_TAG" "$YELLOW" "$VITE_PORT" "Mock Client"
setup_and_run "./packages/apps/dashboard-manager" "$DASHBOARD_TAG" "$PURPLE" "$DASHBOARD_PORT" "Dashboard Manager"

echo -e "\n${GREEN}All servers are now running!${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop all servers${NC}\n"

# Wait for all background processes
wait