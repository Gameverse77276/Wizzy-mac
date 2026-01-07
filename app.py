from flask import Flask, render_template, jsonify, request
import keyring
import os
import sys
import platform

import asyncio
from functools import wraps

# ============================================================================
# CONFIGURATION - Using OS Keychain for credentials (secure, no file issues)
# ============================================================================

SERVICE_NAME = "BTCRulesScript"  # Keyring service name


def get_config_dir():
    """Get the proper config directory for storing data files (like btc_rules.json).

    On Mac: ~/Library/Application Support/BTCRulesScript/
    On Windows: Same directory as .exe (or source directory)
    """
    if getattr(sys, 'frozen', False):
        # Running as compiled executable
        exe_dir = os.path.dirname(sys.executable)

        # Check if we're in a Mac .app bundle
        if '.app/Contents/MacOS' in exe_dir or '.app\\Contents\\MacOS' in exe_dir:
            # Mac .app bundle - use Application Support folder (Apple recommended)
            config_dir = os.path.join(
                os.path.expanduser('~'),
                'Library',
                'Application Support',
                'BTCRulesScript'
            )
        else:
            # Windows .exe or Linux binary - use exe directory
            config_dir = exe_dir
    else:
        # Running from source
        config_dir = os.path.dirname(os.path.abspath(__file__))

    # Ensure config directory exists
    if not os.path.exists(config_dir):
        try:
            os.makedirs(config_dir, exist_ok=True)
            print(f"[CONFIG] Created config directory: {config_dir}")
        except Exception as e:
            print(f"[CONFIG] Warning: Could not create config dir: {e}")

    return config_dir


def get_credential(key):
    """Get a credential from the OS keychain."""
    try:
        value = keyring.get_password(SERVICE_NAME, key)
        return value if value else ""
    except Exception as e:
        print(f"[KEYRING] Error getting {key}: {e}")
        return ""


def set_credential(key, value):
    """Set a credential in the OS keychain."""
    try:
        if value:
            keyring.set_password(SERVICE_NAME, key, value)
        else:
            # Delete the credential if value is empty
            try:
                keyring.delete_password(SERVICE_NAME, key)
            except keyring.errors.PasswordDeleteError:
                pass  # Key didn't exist, that's fine
        return True
    except Exception as e:
        print(f"[KEYRING] Error setting {key}: {e}")
        return False


# Get the appropriate directories
CONFIG_DIR = get_config_dir()

# For templates and static files, we need the app directory
if getattr(sys, 'frozen', False):
    APP_DIR = sys._MEIPASS if hasattr(sys, '_MEIPASS') else os.path.dirname(sys.executable)
else:
    APP_DIR = os.path.dirname(os.path.abspath(__file__))

# Print config location for debugging
print(f"[CONFIG] Config directory: {CONFIG_DIR}")
print(f"[CONFIG] App directory: {APP_DIR}")
print(f"[CONFIG] Using OS Keychain for credentials (service: {SERVICE_NAME})")


from services.bybit_client import BybitClient
from services.symbol_validator import SymbolValidator
from services.position_monitor import PositionMonitor
from services.wallet_manager import WalletManager
from services.tp_sl_monitor import TPSLMonitor


app = Flask(__name__)
app.config['SECRET_KEY'] = 'trade-manager-secret-key'

# Load credentials from OS Keychain
print(f"[CONFIG] Loading credentials from OS Keychain...")
bybit_client = BybitClient(
    api_key=get_credential("api_key"),
    api_secret=get_credential("api_secret"),
    testnet=get_credential("testnet") == "true",
    demo=get_credential("demo") == "true"
)

symbol_validator = SymbolValidator(bybit_client)

position_monitor = PositionMonitor(bybit_client)
wallet_manager = WalletManager(bybit_client)
tp_sl_monitor = TPSLMonitor(bybit_client, position_monitor, symbol_validator, config_dir=CONFIG_DIR)


def async_route(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(f(*args, **kwargs))
        finally:
            loop.close()
    return wrapper


@app.route('/')
def index():
    api_key = get_credential("api_key")
    api_secret = get_credential("api_secret")
    has_credentials = bool(api_key and api_secret)
    return render_template('index.html',
                         has_credentials=has_credentials,
                         api_key=api_key,
                         api_secret=api_secret,
                         testnet=get_credential("testnet") == "true",
                         demo=get_credential("demo") == "true")


@app.route('/settings')
def settings():
    from flask import redirect
    return redirect('/')


def reinitialize_services():
    global bybit_client, symbol_validator, position_monitor, wallet_manager, tp_sl_monitor

    old_entry_prices = wallet_manager.spot_entry_prices.copy() if wallet_manager else {}

    # Load credentials from OS Keychain
    bybit_client = BybitClient(
        api_key=get_credential("api_key"),
        api_secret=get_credential("api_secret"),
        testnet=get_credential("testnet") == "true",
        demo=get_credential("demo") == "true"
    )

    symbol_validator = SymbolValidator(bybit_client)
    position_monitor = PositionMonitor(bybit_client)
    wallet_manager = WalletManager(bybit_client)
    wallet_manager.spot_entry_prices = old_entry_prices
    tp_sl_monitor = TPSLMonitor(bybit_client, position_monitor, symbol_validator, config_dir=CONFIG_DIR)


@app.route('/api/save-settings', methods=['POST'])
def save_settings():
    try:
        data = request.json
        api_key = data.get('apiKey', '')
        api_secret = data.get('apiSecret', '')
        testnet = data.get('testnet', False)
        demo = data.get('demo', False)

        # Save credentials to OS Keychain (secure, no file permission issues)
        set_credential("api_key", api_key)
        set_credential("api_secret", api_secret)
        set_credential("testnet", "true" if testnet else "false")
        set_credential("demo", "true" if demo else "false")

        print(f"[SETTINGS] Saved credentials to OS Keychain (service: {SERVICE_NAME})")

        reinitialize_services()

        print(f"[SETTINGS] Reinitialized with demo={demo}, testnet={testnet}")

        return jsonify({"success": True, "message": "Settings saved to OS Keychain successfully"})
    except Exception as e:
        print(f"[SETTINGS] Error saving settings: {e}")
        return jsonify({"success": False, "error": str(e)}), 500



@app.route('/api/positions')
@async_route
async def get_positions():
    try:
        if not get_credential("api_key") or not get_credential("api_secret"):
            return jsonify({
                "error": "API credentials not configured. Please set your API credentials in settings."
            }), 400

        category = request.args.get('category', 'linear')

        if category == "all":
            futures_positions, spot_positions = await asyncio.gather(
                position_monitor.monitor_positions_with_prices("linear"),
                wallet_manager.get_spot_assets_with_prices(),
                return_exceptions=True
            )

            if isinstance(futures_positions, Exception):
                futures_positions = []
            if isinstance(spot_positions, Exception):
                spot_positions = []

            futures_symbols = {pos.get("symbol") for pos in (futures_positions or [])}
            filtered_spot = [pos for pos in (spot_positions or []) if pos.get("symbol") not in futures_symbols]

            positions = (futures_positions or []) + filtered_spot

        elif category == "spot":
            positions = await wallet_manager.get_spot_assets_with_prices()
        else:
            positions = await position_monitor.monitor_positions_with_prices(category)

        monitors = tp_sl_monitor.get_all_monitors()
        for pos in positions:
            symbol = pos.get("symbol")
            if symbol in monitors:
                pos["monitor"] = monitors[symbol]

        return jsonify({
            "positions": positions,
            "count": len(positions),
            "category": category,
            "timestamp": positions[0]["updated_at"] if positions else None,
            "active_monitors": len(monitors)
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/price/<symbol>')
@async_route
async def get_price(symbol):
    try:
        category = request.args.get('category', 'linear')

        validation = await symbol_validator.validate_symbol(symbol)
        if not validation["valid"]:
            return jsonify({"error": validation["message"]}), 404

        formatted_symbol = validation["formatted_symbol"]

        price = await position_monitor.get_current_price(formatted_symbol, category)

        if price is None:
            return jsonify({"error": f"Price not found for {formatted_symbol}"}), 404

        return jsonify({
            "symbol": formatted_symbol,
            "price": price,
            "category": category
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/symbols')
@async_route
async def get_symbols():
    try:
        symbols = await symbol_validator.get_all_usdt_symbols()
        return jsonify({"symbols": symbols, "count": len(symbols)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/validate-symbol', methods=['POST'])
@async_route
async def validate_symbol():
    try:
        data = request.json
        symbol = data.get('symbol', '')
        result = await symbol_validator.validate_symbol(symbol)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/tp-sl/set', methods=['POST'])
@async_route
async def set_tp_sl():
    try:
        data = request.json
        symbol = data.get("symbol")
        category = data.get("category", "linear")
        side = data.get("side")
        original_size = float(data.get("original_size"))
        rules = data.get("rules", [])

        print(f"[DEBUG] Setting BTC rules for {symbol}: {rules}")

        monitor = await tp_sl_monitor.set_monitor(
            symbol=symbol,
            category=category,
            side=side,
            original_size=original_size,
            rules=rules
        )

        print(f"[DEBUG] BTC rules set successfully: {monitor}")

        return jsonify({"success": True, "monitor": monitor})
    except Exception as e:
        import traceback
        print(f"[ERROR] Failed to set BTC rules: {e}")
        print(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


@app.route('/api/tp-sl/remove/<symbol>', methods=['DELETE'])
def remove_tp_sl(symbol):
    try:
        tp_sl_monitor.remove_monitor(symbol)
        return jsonify({"success": True, "message": f"Monitor removed for {symbol}"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/tp-sl/monitors')
def get_monitors():
    try:
        monitors = tp_sl_monitor.get_all_monitors()
        return jsonify({"monitors": monitors, "count": len(monitors)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/tp-sl/monitor/<symbol>')
def get_monitor(symbol):
    try:
        monitor = tp_sl_monitor.get_monitor(symbol)
        if not monitor:
            return jsonify({"error": f"No monitor found for {symbol}"}), 404
        return jsonify({"monitor": monitor})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/close-position', methods=['POST'])
@async_route
async def close_position():
    try:
        data = request.json
        symbol = data.get('symbol')
        category = data.get('category', 'linear')

        if not symbol:
            return jsonify({"success": False, "error": "Symbol is required"}), 400

        if category == "spot":
            wallet_response = await bybit_client.get_private(
                "/v5/account/wallet-balance",
                params={"accountType": "UNIFIED"}
            )

            if wallet_response.get("retCode") != 0:
                return jsonify({"success": False, "error": wallet_response.get("retMsg", "Failed to get wallet")}), 400

            coins = wallet_response.get("result", {}).get("list", [{}])[0].get("coin", [])

            base_coin = symbol.replace("USDT", "").replace("USDC", "").replace("USD", "")

            coin_balance = None
            for coin in coins:
                if coin.get("coin") == base_coin:
                    coin_balance = coin
                    break

            if not coin_balance:
                return jsonify({"success": False, "error": f"No {base_coin} balance found"}), 404

            available_balance = float(coin_balance.get("walletBalance", 0))

            if available_balance == 0:
                return jsonify({"success": False, "error": "Balance is 0"}), 400

            rounded_qty = await tp_sl_monitor._round_quantity(symbol, available_balance)
            print(f"[CLOSE SPOT] {symbol}: balance={available_balance}, rounded={rounded_qty}")

            response = await bybit_client.post_private(
                "/v5/order/create",
                data={
                    "category": "spot",
                    "symbol": symbol,
                    "side": "Sell",
                    "orderType": "Market",
                    "qty": rounded_qty
                }
            )

            if response.get("retCode") == 0:
                return jsonify({"success": True, "message": f"Sold {available_balance} {base_coin}"})
            else:
                return jsonify({"success": False, "error": response.get("retMsg", "Unknown error")}), 400

        else:
            pos_response = await bybit_client.get_private(
                "/v5/position/list",
                params={"category": category, "symbol": symbol}
            )

            if pos_response.get("retCode") != 0:
                return jsonify({"success": False, "error": pos_response.get("retMsg", "Failed to get position")}), 400

            positions = pos_response.get("result", {}).get("list", [])
            if not positions or len(positions) == 0:
                return jsonify({"success": False, "error": "No position found"}), 404

            position = positions[0]
            position_size = float(position.get("size", 0))
            position_side = position.get("side")

            if position_size == 0:
                return jsonify({"success": False, "error": "Position size is 0"}), 400

            rounded_qty = await tp_sl_monitor._round_quantity(symbol, position_size)
            print(f"[CLOSE FUTURES] {symbol}: size={position_size}, rounded={rounded_qty}")

            close_side = "Sell" if position_side == "Buy" else "Buy"

            response = await bybit_client.post_private(
                "/v5/order/create",
                data={
                    "category": category,
                    "symbol": symbol,
                    "side": close_side,
                    "orderType": "Market",
                    "qty": rounded_qty,
                    "reduceOnly": True
                }
            )

            if response.get("retCode") == 0:
                return jsonify({"success": True, "message": f"Position closed for {symbol}"})
            else:
                return jsonify({"success": False, "error": response.get("retMsg", "Unknown error")}), 400

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


if __name__ == '__main__':
    async def startup():
        await symbol_validator.initialize()
        tp_sl_monitor.start_all_monitors()
        print("\n[OK] Symbol cache initialized")
        print("[OK] BTC rule monitors started")

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(startup())

    print("\n" + "=" * 80)
    print(" " * 27 + "BTC Rules Script")
    print("=" * 80)
    print(f"\n[OK] Flask app running on: http://127.0.0.1:5000")
    print("[OK] BTC rules monitoring active")
    print("=" * 80 + "\n")

    app.run(debug=False, host='127.0.0.1', port=5000, threaded=True)