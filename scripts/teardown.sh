#!/bin/bash

# Get the absolute path to the project root
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Default values
PRODUCTION=false
TAG=""
FORCE=false

# Help message
show_help() {
    echo "Usage: ./teardown.sh [OPTIONS]"
    echo ""
    echo "Remove Bytebot Docker containers"
    echo ""
    echo "Options:"
    echo "  -p, --production  Target the production Docker container (default: development)"
    echo "  -t, --tag TAG     Specify the tag for the container (default: development or production)"
    echo "  -f, --force       Force removal of containers even if they're running"
    echo "  -h, --help        Show this help message"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -p|--production)
            PRODUCTION=true
            shift
            ;;
        -t|--tag)
            TAG="$2"
            shift 2
            ;;
        -f|--force)
            FORCE=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Set default tag if not provided
if [ -z "$TAG" ]; then
    if [ "$PRODUCTION" = true ]; then
        TAG="production"
    else
        TAG="development"
    fi
fi

echo "Tearing down Bytebot environment with tag: $TAG"

# Find Bytebot Docker containers
CONTAINER_ID=$(docker ps -a --filter "ancestor=bytebot:$TAG" --format "{{.ID}}")
CONTAINER_NAMES=$(docker ps -a --filter "name=bytebot" --format "{{.Names}}")

# Stop and remove containers
if [ -n "$CONTAINER_ID" ] || [ -n "$CONTAINER_NAMES" ]; then
    echo "Found Bytebot containers matching tag $TAG:"
    
    if [ -n "$CONTAINER_ID" ]; then
        echo "Stopping container(s) by image: $CONTAINER_ID"
        if [ "$FORCE" = true ]; then
            docker rm -f $CONTAINER_ID
        else
            docker stop $CONTAINER_ID && docker rm $CONTAINER_ID
        fi
    fi
    
    if [ -n "$CONTAINER_NAMES" ]; then
        echo "Stopping container(s) by name: $CONTAINER_NAMES"
        for container in $CONTAINER_NAMES; do
            if [ "$FORCE" = true ]; then
                docker rm -f $container
            else
                docker stop $container && docker rm $container
            fi
        done
    fi
    
    echo "Bytebot containers removed."
else
    echo "No Bytebot containers found."
fi

echo "Bytebot environment teardown complete."

# Make the script executable
chmod +x "$0"