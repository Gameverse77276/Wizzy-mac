#!/bin/bash

# BTCRulesScript - Mac Launcher
# Double-click this file to run the app

cd "$(dirname "$0")"

echo "=========================================="
echo "   BTCRulesScript - Starting..."
echo "=========================================="
echo ""

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python 3 is not installed!"
    echo ""
    echo "Please install Python 3 from: https://www.python.org/downloads/"
    echo ""
    read -p "Press Enter to exit..."
    exit 1
fi

echo "Python found: $(python3 --version)"
echo ""

# Install/update dependencies
echo "Installing dependencies..."
python3 -m pip install --upgrade pip --quiet
python3 -m pip install -r requirements.txt --quiet

if [ $? -ne 0 ]; then
    echo ""
    echo "ERROR: Failed to install dependencies!"
    echo "Try running: python3 -m pip install -r requirements.txt"
    echo ""
    read -p "Press Enter to exit..."
    exit 1
fi

echo "Dependencies installed successfully!"
echo ""

# Run the app
echo "Starting BTCRulesScript..."
echo "Opening browser at http://127.0.0.1:5000"
echo ""
echo "Press Ctrl+C to stop the server"
echo "=========================================="
echo ""

python3 app.py
