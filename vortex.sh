#!/bin/bash
# Wrapper script to run Vortex Chess Engine in any UCI-compatible GUI
node "$(dirname "$0")/dist/cli.js" "$@"
