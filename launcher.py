import sys
import os
import webbrowser
import threading

if __name__ == "__main__":
    import app

    import asyncio
    from services.tp_sl_monitor import TPSLMonitor

    async def startup():
        await app.symbol_validator.initialize()
        app.tp_sl_monitor.start_all_monitors()
        print("\n[OK] Symbol cache initialized")
        print("[OK] BTC rule monitors started")

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(startup())

    print("\n" + "="*80)
    print(" " * 27 + "BTC Rules Script")
    print("="*80)
    print(f"\n[OK] Application running on: http://127.0.0.1:5000")
    print("[OK] BTC rules monitoring active")
    print("="*80 + "\n")

    def open_browser():
        import time
        time.sleep(1.5)
        webbrowser.open("http://127.0.0.1:5000")

    threading.Thread(target=open_browser, daemon=True).start()

    app.app.run(debug=False, host='127.0.0.1', port=5000, threaded=True)
