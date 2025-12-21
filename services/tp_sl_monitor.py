import asyncio
import json
import math
import os
from typing import Dict, List, Optional
from datetime import datetime


class TPSLMonitor:

    def __init__(self, bybit_client, position_monitor, symbol_validator):
        self.bybit_client = bybit_client
        self.position_monitor = position_monitor
        self.symbol_validator = symbol_validator
        self.monitors: Dict[str, Dict] = {}

        self.monitoring_tasks: Dict[str, asyncio.Task] = {}
        self.storage_file = "btc_rules.json"
        self.load_monitors()

    def load_monitors(self):
        if os.path.exists(self.storage_file):
            try:
                with open(self.storage_file, 'r') as f:
                    self.monitors = json.load(f)
                if self.monitors:
                    print(f"\n✓ Loaded {len(self.monitors)} saved BTC rule monitor(s)")
                    for symbol, mon in self.monitors.items():
                        print(f"  - {symbol}: {len(mon.get('rules', []))} rule(s)")
            except Exception as e:
                print(f"Error loading monitors: {e}")
                self.monitors = {}

    def save_monitors(self):
        try:
            with open(self.storage_file, 'w') as f:
                json.dump(self.monitors, f, indent=2)
        except Exception as e:
            print(f"Error saving monitors: {e}")

    async def set_monitor(self, symbol: str, category: str, side: str, original_size: float, rules: List[Dict]):
        current_btc_price = await self.position_monitor.get_current_price("BTCUSDT", "linear")
        if not current_btc_price:
            current_btc_price = 0

        self.monitors[symbol] = {
            "symbol": symbol,
            "category": category,
            "side": side,
            "original_size": original_size,
            "remaining_size": original_size,
            "rules": rules,
            "triggered_rules": [],
            "active_tp": None,
            "active_sl": None,
            "created_at": datetime.now().isoformat(),
            "previous_btc_price": current_btc_price
        }

        self.save_monitors()
        self.start_monitoring(symbol)

        return self.monitors[symbol]

    def remove_monitor(self, symbol: str):
        if symbol in self.monitors:
            del self.monitors[symbol]
            self.save_monitors()

        self.stop_monitoring(symbol)

    def get_monitor(self, symbol: str) -> Optional[Dict]:
        return self.monitors.get(symbol)

    def get_all_monitors(self) -> Dict[str, Dict]:
        return self.monitors

    def start_monitoring(self, symbol: str):
        self.stop_monitoring(symbol)

        import threading
        def run_monitor():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.create_task(self._monitor_symbol(symbol))
            loop.run_forever()

        thread = threading.Thread(target=run_monitor, daemon=True)
        thread.start()
        self.monitoring_tasks[symbol] = thread

    def stop_monitoring(self, symbol: str):
        if symbol in self.monitoring_tasks:
            task_or_thread = self.monitoring_tasks[symbol]
            if hasattr(task_or_thread, 'cancel'):
                task_or_thread.cancel()
            del self.monitoring_tasks[symbol]

    async def _monitor_symbol(self, symbol: str):
        monitor = self.monitors.get(symbol)
        if not monitor:
            return

        print(f"\n{'='*60}")
        print(f"✓ Started BTC rules monitoring for {symbol}")
        print(f"  Category: {monitor['category']} | Side: {monitor['side']}")
        print(f"  Rules configured: {len(monitor['rules'])}")
        for i, rule in enumerate(monitor['rules'], 1):
            if rule['type'] == 'full_close':
                print(f"    Rule {i}: Full close when BTC hits ${rule['btc_price']:,.0f}")
            elif rule['type'] == 'partial_close':
                print(f"    Rule {i}: Close {rule['close_percent']}% when BTC hits ${rule['btc_price']:,.0f}")
            elif rule['type'] == 'set_tp':
                print(f"    Rule {i}: Set TP at ${rule['tp_price']} when BTC hits ${rule['btc_price']:,.0f}")
            elif rule['type'] == 'set_sl':
                print(f"    Rule {i}: Set SL at ${rule['sl_price']} when BTC hits ${rule['btc_price']:,.0f}")
        print(f"{'='*60}\n")

        loop_count = 0  # Track iterations for periodic status updates

        while True:
            try:
                monitor = self.monitors.get(symbol)
                if not monitor:
                    print(f"Monitor for {symbol} was removed, stopping monitoring")
                    break

                try:
                    btc_price = await asyncio.wait_for(
                        self.position_monitor.get_current_price("BTCUSDT", "linear"),
                        timeout=5.0
                    )
                except asyncio.TimeoutError:
                    print(f"[BTC MONITOR] Timeout getting BTC price, retrying...")
                    await asyncio.sleep(2)
                    continue
                except Exception as e:
                    print(f"[BTC MONITOR] Error getting BTC price: {e}")
                    await asyncio.sleep(2)
                    continue

                if not btc_price:
                    await asyncio.sleep(2)
                    continue

                try:
                    coin_price = await asyncio.wait_for(
                        self.position_monitor.get_current_price(symbol, monitor["category"]),
                        timeout=5.0
                    )
                except:
                    await asyncio.sleep(2)
                    continue

                if not coin_price:
                    await asyncio.sleep(2)
                    continue

                loop_count += 1
                if loop_count % 15 == 0:
                    print(f"[MONITOR {symbol}] BTC: ${btc_price:,.0f} | {symbol}: ${coin_price:.4f} | {len(monitor['rules'])} rules active")

                previous_btc = monitor.get("previous_btc_price", btc_price)

                for rule in monitor["rules"]:
                    if rule['type'] == 'partial_close':
                        rule_id = f"{rule['type']}_{rule['btc_price']}_{rule['close_percent']}"
                    elif rule['type'] == 'set_tp':
                        rule_id = f"{rule['type']}_{rule['btc_price']}_{rule['tp_price']}_{rule['close_percent']}"
                    elif rule['type'] == 'set_sl':
                        rule_id = f"{rule['type']}_{rule['btc_price']}_{rule['sl_price']}"
                    else:
                        rule_id = f"{rule['type']}_{rule['btc_price']}"

                    if rule_id in monitor.get("triggered_rules", []):
                        continue

                    trigger_price = rule["btc_price"]

                    crossed_up = previous_btc < trigger_price and btc_price >= trigger_price
                    crossed_down = previous_btc > trigger_price and btc_price <= trigger_price

                    if crossed_up or crossed_down:
                        await self._execute_rule(monitor, rule, rule_id, coin_price, btc_price)
                        monitor = self.monitors.get(symbol)
                        if not monitor:
                            break

                monitor["previous_btc_price"] = btc_price
                self.monitors[symbol] = monitor

                if monitor and monitor.get("active_tp"):
                    tp_data = monitor["active_tp"]
                    if self._should_trigger_tp(monitor, coin_price, tp_data["price"]):
                        close_size = (monitor["original_size"] * tp_data["close_percent"]) / 100
                        if close_size > monitor["remaining_size"]:
                            close_size = monitor["remaining_size"]

                        await self._close_position(symbol, close_size, f"TP hit at ${tp_data['price']}", coin_price)
                        monitor["remaining_size"] -= close_size
                        monitor["active_tp"] = None
                        self.monitors[symbol] = monitor
                        self.save_monitors()

                        if monitor["remaining_size"] <= 0:
                            self.remove_monitor(symbol)
                            return

                        monitor = self.monitors.get(symbol)
                        if not monitor:
                            break

                if monitor and monitor.get("active_sl"):
                    sl_data = monitor["active_sl"]
                    if self._should_trigger_sl(monitor, coin_price, sl_data["price"]):
                        close_size = (monitor["original_size"] * sl_data["close_percent"]) / 100
                        if close_size > monitor["remaining_size"]:
                            close_size = monitor["remaining_size"]

                        await self._close_position(symbol, close_size, f"SL hit at ${sl_data['price']}", coin_price)
                        monitor["remaining_size"] -= close_size
                        monitor["active_sl"] = None
                        self.monitors[symbol] = monitor
                        self.save_monitors()

                        if monitor["remaining_size"] <= 0:
                            self.remove_monitor(symbol)
                            return

                        monitor = self.monitors.get(symbol)
                        if not monitor:
                            break

                await asyncio.sleep(2)

            except asyncio.CancelledError:
                print(f"Stopped monitoring {symbol}")
                break
            except Exception as e:
                print(f"Error monitoring {symbol}: {e}")
                await asyncio.sleep(2)

    async def _execute_rule(self, monitor: Dict, rule: Dict, rule_id: str, coin_price: float, btc_price: float):
        symbol = monitor["symbol"]
        rule_type = rule["type"]

        print(f"\n{'!'*60}")
        print(f"🚨 BTC RULE TRIGGERED!")
        print(f"   Symbol: {symbol}")
        print(f"   Rule Type: {rule_type}")
        print(f"   BTC Price: ${btc_price:,.2f}")
        print(f"   {symbol} Price: ${coin_price:.4f}")
        print(f"{'!'*60}\n")

        if rule_type == "full_close":
            await self._close_position(symbol, monitor["remaining_size"],
                                      f"Full close (BTC @ ${btc_price})", coin_price)
            self.remove_monitor(symbol)
            return

        elif rule_type == "partial_close":
            close_size = (monitor["original_size"] * rule["close_percent"]) / 100
            if close_size > monitor["remaining_size"]:
                close_size = monitor["remaining_size"]

            await self._close_position(symbol, close_size,
                                      f"Partial close {rule['close_percent']}% (BTC @ ${btc_price})", coin_price)
            monitor["remaining_size"] -= close_size
            monitor.setdefault("triggered_rules", []).append(rule_id)
            self.monitors[symbol] = monitor
            self.save_monitors()

            if monitor["remaining_size"] <= 0:
                self.remove_monitor(symbol)

        elif rule_type == "set_tp":
            if rule.get("close_percent") == 100:
                await self._set_bybit_tp_sl(symbol, monitor, tp_price=rule["tp_price"], sl_price=None)
                print(f"[BTC RULE] TP set on Bybit exchange at ${rule['tp_price']} (100% full close)")
            else:
                monitor["active_tp"] = {
                    "price": rule["tp_price"],
                    "close_percent": rule["close_percent"]
                }
                print(f"[BTC RULE] TP monitoring set to ${rule['tp_price']} (will close {rule['close_percent']}% when hit)")

            monitor.setdefault("triggered_rules", []).append(rule_id)
            self.monitors[symbol] = monitor
            self.save_monitors()

        elif rule_type == "set_sl":
            if rule.get("close_percent") == 100:
                await self._set_bybit_tp_sl(symbol, monitor, tp_price=None, sl_price=rule["sl_price"])
                print(f"[BTC RULE] SL set on Bybit exchange at ${rule['sl_price']} (100% full close)")
            else:
                monitor["active_sl"] = {
                    "price": rule["sl_price"],
                    "close_percent": rule["close_percent"]
                }
                print(f"[BTC RULE] SL monitoring set to ${rule['sl_price']} (will close {rule['close_percent']}% when hit)")

            monitor.setdefault("triggered_rules", []).append(rule_id)
            self.monitors[symbol] = monitor
            self.save_monitors()

    async def _set_bybit_tp_sl(self, symbol: str, monitor: Dict, tp_price: Optional[float], sl_price: Optional[float]):
        try:
            category = monitor["category"]

            if category != "linear":
                print(f"[BYBIT TP/SL] Skipping - only linear/futures supports TP/SL on exchange (symbol: {symbol}, category: {category})")
                return

            data = {
                "category": category,
                "symbol": symbol,
            }

            if tp_price is not None:
                data["takeProfit"] = str(tp_price)

            if sl_price is not None:
                data["stopLoss"] = str(sl_price)

            result = await self.bybit_client.post_private(
                "/v5/position/trading-stop",
                data=data
            )

            if result.get("retCode") == 0:
                tp_msg = f"TP=${tp_price}" if tp_price else ""
                sl_msg = f"SL=${sl_price}" if sl_price else ""
                print(f"[BYBIT TP/SL] Successfully set on exchange for {symbol}: {tp_msg} {sl_msg}")
            else:
                print(f"[BYBIT TP/SL] Failed to set on exchange: {result.get('retMsg')}")

        except Exception as e:
            print(f"[BYBIT TP/SL ERROR] {symbol}: {e}")

    def _should_trigger_sl(self, monitor: Dict, current_price: float, sl_price: float) -> bool:
        side = monitor["side"]

        if side == "Buy" or side == "Spot":
            return current_price <= sl_price
        else:
            return current_price >= sl_price

    def _should_trigger_tp(self, monitor: Dict, current_price: float, tp_price: float) -> bool:
        side = monitor["side"]

        if side == "Buy":
            return current_price >= tp_price
        elif side == "Sell":
            return current_price <= tp_price
        else:
            return current_price >= tp_price

    async def _round_quantity(self, symbol: str, size: float) -> str:
        print(f"[QTY ROUND START] {symbol}: size={size}")
        try:
            qty_step_str = await self.symbol_validator.get_qty_step(symbol)
            print(f"[QTY ROUND] Got qtyStep: {qty_step_str}")
            qty_step = float(qty_step_str)

            rounded = math.floor(size / qty_step) * qty_step

            if '.' in qty_step_str:
                decimals = len(qty_step_str.rstrip('0').split('.')[-1])
                if decimals == 0:
                    result = str(int(rounded))
                else:
                    result = f"{rounded:.{decimals}f}".rstrip('0').rstrip('.')
            else:
                result = str(int(rounded))

            print(f"[QTY ROUND] {symbol}: size={size}, qtyStep={qty_step_str}, rounded={result}")
            return result
        except Exception as e:
            print(f"[QTY ROUND ERROR] {symbol}: {e}, using fallback")
            if "BTC" in symbol:
                result = f"{math.floor(size * 100) / 100:.2f}".rstrip('0').rstrip('.')
            elif "ETH" in symbol:
                result = f"{math.floor(size * 100) / 100:.2f}".rstrip('0').rstrip('.')
            else:
                result = str(int(math.floor(size)))
            print(f"[QTY ROUND] {symbol}: size={size}, fallback rounded={result}")
            return result

    async def _close_position(self, symbol: str, size: float, reason: str, price: float):
        try:
            monitor = self.monitors.get(symbol)
            if not monitor:
                return

            category = monitor["category"]
            side = monitor["side"]

            rounded_qty = await self._round_quantity(symbol, size)

            print(f"Closing {rounded_qty} of {symbol} - {reason} @ ${price}")

            if category == "linear":
                close_side = "Sell" if side == "Buy" else "Buy"

                result = await self.bybit_client.post_private(
                    "/v5/order/create",
                    data={
                        "category": category,
                        "symbol": symbol,
                        "side": close_side,
                        "orderType": "Market",
                        "qty": rounded_qty,
                        "reduceOnly": True,
                        "closeOnTrigger": False
                    }
                )

                if result.get("retCode") == 0:
                    print(f"Closed {rounded_qty} {symbol} via {reason}")
                else:
                    print(f"Failed to close {symbol}: {result.get('retMsg')}")

            elif category == "spot":
                result = await self.bybit_client.post_private(
                    "/v5/order/create",
                    data={
                        "category": category,
                        "symbol": symbol,
                        "side": "Sell",
                        "orderType": "Market",
                        "qty": rounded_qty
                    }
                )

                if result.get("retCode") == 0:
                    print(f"Sold {rounded_qty} {symbol} via {reason}")
                else:
                    print(f"Failed to sell {symbol}: {result.get('retMsg')}")

        except Exception as e:
            print(f"Error closing position {symbol}: {e}")

    def start_all_monitors(self):
        for symbol in list(self.monitors.keys()):
            self.start_monitoring(symbol)
