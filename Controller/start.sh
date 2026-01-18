#!/bin/sh
echo "Container started at $(date)"
echo "Working directory: $(pwd)"
echo "Files present:"
ls -la
echo "Node version:"
node --version
echo "Starting app..."
exec node index.js