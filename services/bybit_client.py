import hmac
import time

import httpx
from typing import Dict, Any, Optional


class BybitClient:

    def __init__(self, api_key: str = "", api_secret: str = "", testnet: bool = False, demo: bool = False):
        self.api_key = api_key.strip().strip("'").strip('"')
        self.api_secret = api_secret.strip().strip("'").strip('"')

        if demo:
            self.base_url = "https://api-demo.bybit.com"
        elif testnet:
            self.base_url = "https://api-testnet.bybit.com"
        else:
            self.base_url = "https://api.bybit.com"

        self.recv_window = "20000"

        self.time_offset = 0
        self.last_sync = 0

    def _generate_signature(self, timestamp: str, params: str) -> str:
        param_str = f"{timestamp}{self.api_key}{self.recv_window}{params}"
        return hmac.new(
            self.api_secret.encode("utf-8"),
            param_str.encode("utf-8"),
            digestmod="sha256"
        ).hexdigest()

    def _get_headers(self, signature: str, timestamp: str) -> Dict[str, str]:
        return {
            "X-BAPI-API-KEY": self.api_key,
            "X-BAPI-SIGN": signature,
            "X-BAPI-TIMESTAMP": timestamp,
            "X-BAPI-RECV-WINDOW": self.recv_window,
            "Content-Type": "application/json"
        }

    async def _sync_time(self) -> None:
        try:
            if time.time() - self.last_sync < 300:
                return


            url = f"{self.base_url}/v5/market/time"
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url)
                data = response.json()

                if data.get("retCode") == 0:
                    server_time = int(data["result"]["timeSecond"]) * 1000
                    local_time = int(time.time() * 1000)
                    self.time_offset = server_time - local_time
                    self.last_sync = time.time()

                    print(f"Time synced with Bybit. Offset: {self.time_offset}ms")
        except Exception as e:
            print(f"Failed to sync time: {e}")
            self.time_offset = 0

    def _get_timestamp(self) -> str:
        local_time = int(time.time() * 1000)
        return str(local_time + self.time_offset)

    async def get_public(self, endpoint: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        url = f"{self.base_url}{endpoint}"

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, params=params or {})
            response.raise_for_status()
            return response.json()

    async def get_private(self, endpoint: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        await self._sync_time()

        timestamp = self._get_timestamp()

        param_dict = params or {}
        sorted_keys = sorted(param_dict.keys())
        query_string = "&".join([f"{k}={param_dict[k]}" for k in sorted_keys])

        signature = self._generate_signature(timestamp, query_string)
        headers = self._get_headers(signature, timestamp)

        url = f"{self.base_url}{endpoint}"

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, params=params or {}, headers=headers)
            response.raise_for_status()
            return response.json()

    async def post_private(self, endpoint: str, data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        await self._sync_time()

        timestamp = self._get_timestamp()

        import json
        body = json.dumps(data or {})

        signature = self._generate_signature(timestamp, body)
        headers = self._get_headers(signature, timestamp)

        url = f"{self.base_url}{endpoint}"

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, content=body, headers=headers)
            response.raise_for_status()
            return response.json()