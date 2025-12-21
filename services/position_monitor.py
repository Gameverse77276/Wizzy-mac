from typing import Dict, List, Optional
import asyncio

from datetime import datetime


class PositionMonitor:

    def __init__(self, bybit_client):
        self.bybit_client = bybit_client
        self.positions: Dict[str, Dict] = {}

        self.current_prices: Dict[str, float] = {}
        self.price_update_task = None

    async def get_positions(self, category: str = "linear") -> List[Dict]:
        try:
            response = await self.bybit_client.get_private(
                "/v5/position/list",
                params={"category": category, "settleCoin": "USDT"}
            )

            if response.get("retCode") == 0:
                positions = response.get("result", {}).get("list", [])

                open_positions = [
                    pos for pos in positions
                    if float(pos.get("size", 0)) > 0
                ]

                return open_positions
            else:
                print(f"Error fetching positions: {response.get('retMsg')}")
                return []

        except Exception as e:
            print(f"Error in get_positions: {e}")
            return []

    async def get_current_price(self, symbol: str, category: str = "linear") -> Optional[float]:
        try:
            response = await self.bybit_client.get_public(
                "/v5/market/tickers",
                params={"category": category, "symbol": symbol}
            )

            if response.get("retCode") == 0:
                result = response.get("result", {}).get("list", [])
                if result:
                    return float(result[0].get("lastPrice", 0))

            return None

        except Exception as e:
            print(f"Error fetching price for {symbol}: {e}")
            return None

    async def enrich_position_with_price(self, position: Dict, category: str = "linear") -> Dict:
        symbol = position.get("symbol")
        side = position.get("side")
        size = float(position.get("size", 0))
        entry_price = float(position.get("avgPrice", 0))

        leverage = float(position.get("leverage", 1))

        current_price = await self.get_current_price(symbol, category)

        if not current_price:
            current_price = entry_price

        if side == "Buy":
            pnl = (current_price - entry_price) * size
            pnl_percentage = ((current_price - entry_price) / entry_price) * 100 * leverage
        else:
            pnl = (entry_price - current_price) * size
            pnl_percentage = ((entry_price - current_price) / entry_price) * 100 * leverage


        position_value = current_price * size

        return {
            "symbol": symbol,
            "side": side,
            "size": size,
            "entry_price": entry_price,
            "current_price": current_price,
            "leverage": leverage,
            "position_value": position_value,
            "unrealized_pnl": pnl,
            "pnl_percentage": pnl_percentage,
            "take_profit": position.get("takeProfit"),
            "stop_loss": position.get("stopLoss"),
            "liquidation_price": position.get("liqPrice"),
            "updated_at": datetime.now().isoformat()
        }

    async def monitor_positions_with_prices(self, category: str = "linear") -> List[Dict]:
        positions = await self.get_positions(category)

        if not positions:
            return []

        enriched_positions = await asyncio.gather(
            *[self.enrich_position_with_price(pos, category) for pos in positions]
        )

        return list(enriched_positions)

    async def start_price_stream(self, symbols: List[str], callback, category: str = "linear", interval: float = 0.001):
        while True:
            try:
                for symbol in symbols:
                    price = await self.get_current_price(symbol, category)
                    if price:
                        await callback(symbol, price)

                await asyncio.sleep(interval)

            except Exception as e:
                print(f"Error in price stream: {e}")
                await asyncio.sleep(1)