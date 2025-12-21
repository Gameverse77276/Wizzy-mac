# BTC Rules Script

Automated BTC-triggered trading rules for Bybit positions.

## Features

- **BTC-Triggered Rules**: Automatically execute trades when BTC reaches specific prices
- **Multiple Rule Types**:
  - Rule 1: Full close position
  - Rule 2: Partial close (add multiple rules at different BTC prices)
  - Rule 3: Set Take Profit
  - Rule 4: Set Stop Loss (always 100% close)
- **Real-time BTC Price Monitoring**
- **Position Tracking**: Track closed vs remaining position percentages
- **Bi-directional Triggers**: Rules trigger when BTC crosses price going up OR down

## Download Pre-built Apps

### GitHub Actions (Easiest!)

1. Go to the [Actions tab](https://github.com/Gameverse77276/Wizzy-mac/actions)
2. Click on the latest successful workflow run
3. Scroll down to "Artifacts"
4. Download:
   - **BTCRulesScript-macOS** - The .app file
   - **BTCRulesScript-macOS-DMG** - DMG installer (if available)

### Manual Trigger

You can also manually trigger a build:
1. Go to [Actions tab](https://github.com/Gameverse77276/Wizzy-mac/actions)
2. Click "Build macOS App" workflow
3. Click "Run workflow" button
4. Wait for build to complete
5. Download the artifact

## Installation

### macOS

1. Download `BTCRulesScript-macOS` artifact from GitHub Actions
2. Unzip the downloaded file
3. Right-click `BTCRulesScript.app` → Open (first time only, to bypass Gatekeeper)
4. Or run in Terminal: `xattr -cr BTCRulesScript.app && open BTCRulesScript.app`

### Windows

1. Download the Windows .exe (if available in releases)
2. Double-click `BTCRulesScript.exe`
3. Allow through Windows Defender if prompted

## Running from Source

### Requirements

- Python 3.8+
- Dependencies: `pip install -r requirements.txt`

### Start the Application

```bash
python launcher.py
```

Or:

```bash
python app.py
```

Then open your browser to `http://127.0.0.1:5000`

## Configuration

Set your Bybit API credentials as environment variables:

```bash
export BYBIT_API_KEY="your_api_key"
export BYBIT_API_SECRET="your_api_secret"
export BYBIT_TESTNET="false"  # Use "true" for testnet
export BYBIT_DEMO="false"     # Use "true" for demo trading
```

Or the app will prompt you to enter them on first run.

## Building from Source

### macOS

```bash
# Make build script executable
chmod +x build_mac.sh

# Build
./build_mac.sh
```

See [README_MAC.md](README_MAC.md) for detailed instructions.

### Windows

```bash
pyinstaller --onefile --name BTCRulesScript --add-data "templates;templates" --add-data "static;static" --add-data "services;services" launcher.py
```

## Usage

1. **Connect Bybit API**: Enter your API credentials
2. **View Positions**: See all your open positions with real-time prices
3. **Apply Rules**: Click "Apply Rules" on any position
4. **Configure Rules**:
   - Toggle each rule type on/off
   - Set BTC trigger prices
   - Set close percentages or TP/SL prices
   - For Rule 2, add multiple partial close rules
5. **Monitor**: Rules execute automatically when BTC reaches trigger prices
6. **Track Progress**: See which rules triggered (strikethrough + checkmark)

## How It Works

- BTC price is monitored every 2 seconds
- When BTC crosses a trigger price (up or down), the rule executes
- Partial close percentages are based on **original position size**
- Triggered rules are marked and won't execute again
- Position tracking shows closed vs remaining percentages

## Architecture

- **Frontend**: HTML/CSS/JavaScript (dark theme UI)
- **Backend**: Flask Python REST API
- **Monitoring**: Async position and BTC price monitoring
- **Exchange**: Bybit API v5 integration

## Troubleshooting

### macOS: "App can't be opened"
```bash
xattr -cr BTCRulesScript.app
```

### Port 5000 in use
**macOS:**
```bash
kill -9 $(lsof -ti:5000)
```

**Windows:**
```bash
netstat -ano | findstr :5000
taskkill /F /PID <PID>
```

## License

Private project - All rights reserved

## Support

For issues, check the GitHub Issues tab or contact the developer.
