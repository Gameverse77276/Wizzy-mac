#!/bin/bash

# Build script for macOS
# This script creates a standalone .app bundle for macOS

echo "Building BTC Rules Script for macOS..."

# Check if pyinstaller is installed
if ! command -v pyinstaller &> /dev/null
then
    echo "PyInstaller not found. Installing..."
    pip3 install pyinstaller
fi

# Clean previous builds
rm -rf build dist BTCRulesScript.app

# Build the .app
pyinstaller --onefile \
    --windowed \
    --name BTCRulesScript \
    --add-data "templates:templates" \
    --add-data "static:static" \
    --add-data "services:services" \
    --icon icon.icns \
    launcher.py

# Move .app to current directory
if [ -d "dist/BTCRulesScript.app" ]; then
    mv dist/BTCRulesScript.app .
    echo "Build successful! BTCRulesScript.app created."
else
    echo "Build failed!"
    exit 1
fi

# Clean up
rm -rf build dist BTCRulesScript.spec

echo "Done! You can now run BTCRulesScript.app"
