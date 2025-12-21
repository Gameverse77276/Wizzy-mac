# BTC Rules Script - macOS Build Instructions

## Prerequisites

1. **Python 3.8+**
   ```bash
   # Check Python version
   python3 --version

   # Install Python if needed (using Homebrew)
   brew install python3
   ```

2. **Install Dependencies**
   ```bash
   pip3 install -r requirements.txt
   pip3 install pyinstaller
   ```

## Building the .app for macOS

### Method 1: Using the Build Script (Recommended)

1. Make the build script executable:
   ```bash
   chmod +x build_mac.sh
   ```

2. Run the build script:
   ```bash
   ./build_mac.sh
   ```

3. The `BTCRulesScript.app` will be created in the current directory.

### Method 2: Manual Build

Run the following command:
```bash
pyinstaller --onefile --windowed --name BTCRulesScript \
    --add-data "templates:templates" \
    --add-data "static:static" \
    --add-data "services:services" \
    launcher.py
```

The .app will be in the `dist` folder.

## Running the Application

### First Time Setup

1. **Set Your API Credentials**
   - Before running the app, you'll need to set your Bybit API credentials
   - You can do this by:
     - Setting environment variables, OR
     - The app will prompt you on first run

2. **Gatekeeper Permission (macOS Security)**

   Since the app is not signed with an Apple Developer certificate, macOS Gatekeeper will block it by default.

   **To allow the app to run:**

   - Right-click on `BTCRulesScript.app`
   - Select "Open" from the menu
   - Click "Open" in the security dialog

   OR use Terminal:
   ```bash
   xattr -cr BTCRulesScript.app
   ```

3. **Launch the App**
   - Double-click `BTCRulesScript.app`
   - A terminal window will open showing the Flask server
   - Your browser will open to `http://127.0.0.1:5000`

## Features

- **BTC-Triggered Rules**: Automatically execute trades when BTC reaches specific prices
- **Multiple Rule Types**:
  - Rule 1: Full close position
  - Rule 2: Partial close (multiple rules supported)
  - Rule 3: Set Take Profit
  - Rule 4: Set Stop Loss
- **Real-time BTC Price Monitoring**
- **Position Tracking**: Track closed vs remaining position percentages
- **Bi-directional Triggers**: Rules trigger on price crossing up OR down

## Troubleshooting

### App won't open
- Check security settings (Gatekeeper)
- Try the `xattr -cr BTCRulesScript.app` command
- Check Console.app for error messages

### Port 5000 already in use
```bash
# Find process using port 5000
lsof -ti:5000

# Kill the process
kill -9 $(lsof -ti:5000)
```

### Dependencies missing
```bash
# Reinstall dependencies
pip3 install -r requirements.txt --force-reinstall
```

## Development Mode

To run in development mode without building:
```bash
python3 launcher.py
```

## Creating a DMG Installer (Optional)

1. Install `create-dmg`:
   ```bash
   brew install create-dmg
   ```

2. Create DMG:
   ```bash
   create-dmg \
     --volname "BTC Rules Script" \
     --window-pos 200 120 \
     --window-size 800 400 \
     --icon-size 100 \
     --app-drop-link 600 185 \
     "BTCRulesScript.dmg" \
     "BTCRulesScript.app"
   ```

## Architecture

- **Frontend**: HTML/CSS/JavaScript with dark theme UI
- **Backend**: Flask (Python) REST API
- **Position Monitoring**: Async monitoring service for BTC price and position tracking
- **Exchange Integration**: Bybit API v5

## Notes

- The app needs internet connection to connect to Bybit API
- BTC price is updated every 2 seconds
- Position data refreshes automatically
- Triggered rules are marked with strikethrough and checkmark
- All percentages for partial close are based on original position size

## Support

For issues or questions, check the terminal output when the app is running.
