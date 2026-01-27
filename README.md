# BTC Rules Script

Automated BTC-triggered trading rules for Bybit positions.

## Quick Start

### Requirements

- **Python 3.8+** - Download from https://www.python.org/downloads/
  - **Important (Windows)**: Check "Add Python to PATH" during installation!

### Running the App

**Mac:**
1. Double-click `run_mac.command`
2. If it won't open, right-click → Open → Open
3. The browser will open automatically

**Windows:**
1. Double-click `run_windows.bat`
2. The browser will open automatically

That's it! Dependencies install automatically on first run.

---

## Features

- **BTC-Triggered Rules**: Automatically execute trades when BTC reaches specific prices
- **Multiple Rule Types**:
  - Rule 1: Full close position
  - Rule 2: Partial close (add multiple rules at different BTC prices)
  - Rule 3: Set Take Profit
  - Rule 4: Set Stop Loss (always 100% close)
- **Real-time BTC Price Monitoring** (every 2 seconds)
- **Position Tracking**: Track closed vs remaining position percentages
- **Bi-directional Triggers**: Rules trigger when BTC crosses price going up OR down

## Usage

1. **Connect Bybit API**: Enter your API credentials on the settings page
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

## Troubleshooting

### Port 5000 in use

**Mac:**
```bash
kill -9 $(lsof -ti:5000)
```

**Windows:**
```cmd
netstat -ano | findstr :5000
taskkill /F /PID <PID>
```

### Mac: "unidentified developer" warning
Right-click → Open → Open

### Manual Run (if launcher scripts don't work)
```bash
pip install -r requirements.txt
python app.py
```

## Config File Location

Your API credentials are saved in:
- **Mac**: `~/Library/Application Support/BTCRulesScript/config.json`
- **Windows**: Same folder as the app

## License

Private project - All rights reserved
