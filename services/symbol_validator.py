from typing import Dict, List, Set
import asyncio

from datetime import datetime, timedelta


class SymbolValidator:

    def __init__(self, bybit_client):
        self.bybit_client = bybit_client
        self.valid_symbols: Set[str] = set()
        self.instrument_info: Dict[str, Dict] = {}
        self.last_update: datetime = None
        self.cache_duration = timedelta(hours=1)

    async def initialize(self):
        await self._refresh_symbols()

    async def _refresh_symbols(self):
        try:
            all_symbols = set()


            response = await self.bybit_client.get_public(
                "/v5/market/instruments-info",
                params={"category": "linear"}
            )
            if response.get("retCode") == 0:
                symbols = response.get("result", {}).get("list", [])
                linear_symbols = {
                    item["symbol"] for item in symbols
                    if item["symbol"].endswith("USDT")
                }
                all_symbols.update(linear_symbols)
                for item in symbols:
                    if item["symbol"].endswith("USDT"):
                        self.instrument_info[item["symbol"]] = {
                            "category": "linear",
                            "lotSizeFilter": item.get("lotSizeFilter", {})
                        }

                print(f"Loaded {len(linear_symbols)} Linear (USDT Perpetuals) symbols")

            response = await self.bybit_client.get_public(
                "/v5/market/instruments-info",
                params={"category": "spot"}
            )
            if response.get("retCode") == 0:
                symbols = response.get("result", {}).get("list", [])
                spot_symbols = {
                    item["symbol"] for item in symbols
                    if item["symbol"].endswith("USDT")
                }
                all_symbols.update(spot_symbols)
                for item in symbols:
                    if item["symbol"].endswith("USDT"):
                        self.instrument_info[item["symbol"]] = {
                            "category": "spot",
                            "lotSizeFilter": item.get("lotSizeFilter", {})
                        }
                print(f"Loaded {len(spot_symbols)} Spot symbols")

            self.valid_symbols = all_symbols
            self.last_update = datetime.now()
            print(f"Total: {len(self.valid_symbols)} USDT symbols loaded")

        except Exception as e:
            print(f"Error refreshing symbols: {e}")

    async def _ensure_fresh_cache(self):
        if not self.last_update or datetime.now() - self.last_update > self.cache_duration:
            await self._refresh_symbols()

    def _format_symbol(self, symbol: str) -> str:
        symbol = symbol.strip().upper()

        symbol = symbol.replace("/", "").replace("-", "").replace("_", "")

        if symbol.endswith("USDT"):
            return symbol

        return f"{symbol}USDT"

    async def validate_symbol(self, symbol: str) -> Dict[str, any]:
        await self._ensure_fresh_cache()

        formatted = self._format_symbol(symbol)

        if formatted in self.valid_symbols:
            return {
                "valid": True,
                "formatted_symbol": formatted,
                "message": f"Symbol validated: {formatted}"
            }
        else:
            return {
                "valid": False,
                "formatted_symbol": formatted,
                "message": f"Symbol '{formatted}' not found on Bybit. Please check the symbol."
            }

    async def get_all_usdt_symbols(self) -> List[str]:
        await self._ensure_fresh_cache()
        return sorted(list(self.valid_symbols))

    async def get_qty_step(self, symbol: str) -> str:
        await self._ensure_fresh_cache()
        formatted = self._format_symbol(symbol)
        info = self.instrument_info.get(formatted, {})
        lot_size = info.get("lotSizeFilter", {})
        qty_step = lot_size.get("qtyStep", "1")
        print(f"[GET QTY STEP] {symbol} -> {formatted}: qtyStep={qty_step}, has_info={formatted in self.instrument_info}, total_cached={len(self.instrument_info)}")
        if formatted not in self.instrument_info:
            print(f"[WARNING] {formatted} not found in cache! Using default qtyStep=1")
        return qty_step