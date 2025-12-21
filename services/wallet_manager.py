from typing import Dict, List, Optional

from datetime import datetime


class WalletManager:

    def __init__(self, bybit_client):
        self.bybit_client = bybit_client
        self.spot_entry_prices = {}

    async def get_wallet_balances(self) -> List[Dict]:
        try:
            response = await self.bybit_client.get_private(
                "/v5/account/wallet-balance",
                params={"accountType": "UNIFIED"}
            )

            if response.get("retCode") == 0:
                result = response.get("result", {})
                accounts = result.get("list", [])

                if not accounts:
                    return []

                account = accounts[0]
                coins = account.get("coin", [])

                assets = []
                for coin in coins:
                    coin_name = coin.get("coin")
                    wallet_balance = float(coin.get("walletBalance", 0))

                    if coin_name == "USDT" or wallet_balance <= 0:
                        continue

                    equity = float(coin.get("equity", 0))
                    usd_value = float(coin.get("usdValue", 0))

                    assets.append({
                        "coin": coin_name,
                        "balance": wallet_balance,
                        "equity": equity,
                        "usd_value": usd_value,
                        "updated_at": datetime.now().isoformat()
                    })

                return assets

            else:
                print(f"Error fetching wallet balance: {response.get('retMsg')}")
                return []

        except Exception as e:
            print(f"Error in get_wallet_balances: {e}")
            return []

    async def get_spot_assets_with_prices(self) -> List[Dict]:
        import asyncio

        assets = await self.get_wallet_balances()


        if not assets:
            return []

        async def enrich_asset(asset):
            coin = asset["coin"]
            symbol = f"{coin}USDT"

            current_price = await self.get_current_price(symbol)

            if not current_price:
                return None

            if coin not in self.spot_entry_prices:
                self.spot_entry_prices[coin] = current_price

            entry_price = self.spot_entry_prices[coin]
            position_value = asset["balance"] * current_price
            entry_value = asset["balance"] * entry_price
            unrealized_pnl = position_value - entry_value
            pnl_percentage = ((current_price - entry_price) / entry_price * 100) if entry_price > 0 else 0

            return {
                "symbol": symbol,
                "coin": coin,
                "side": "Spot",
                "size": asset["balance"],
                "current_price": current_price,
                "position_value": position_value,
                "usd_value": asset["usd_value"],
                "equity": asset["equity"],
                "leverage": 1,
                "entry_price": entry_price,
                "unrealized_pnl": unrealized_pnl,
                "pnl_percentage": pnl_percentage,
                "take_profit": None,
                "stop_loss": None,
                "liquidation_price": None,
                "updated_at": asset["updated_at"]
            }

        enriched_assets = await asyncio.gather(
            *[enrich_asset(asset) for asset in assets]
        )

        return [asset for asset in enriched_assets if asset is not None]

    async def get_current_price(self, symbol: str) -> Optional[float]:
        try:
            response = await self.bybit_client.get_public(
                "/v5/market/tickers",
                params={"category": "spot", "symbol": symbol}
            )

            if response.get("retCode") == 0:
                result = response.get("result", {}).get("list", [])
                if result:
                    return float(result[0].get("lastPrice", 0))

            return None

        except Exception as e:
            print(f"Error fetching price for {symbol}: {e}")
            return None