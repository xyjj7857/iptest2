import CryptoJS from 'crypto-js';

export class BinanceService {
  private apiKey: string;
  private secretKey: string;
  private baseUrl: string;
  private timeOffset: number = 0;
  private ipSelection: 'local' | 'proxy' = 'local';

  constructor(apiKey: string, secretKey: string, baseUrl: string) {
    this.apiKey = apiKey.trim();
    this.secretKey = secretKey.trim();
    this.baseUrl = baseUrl.trim();
    this.syncTime();
  }

  setIpSelection(selection: 'local' | 'proxy') {
    this.ipSelection = selection;
  }

  async syncTime() {
    try {
      const start = Date.now();
      const url = `${this.baseUrl}/fapi/v1/time`;
      let data;
      let response;

      if (this.ipSelection === 'proxy') {
        response = await fetch('/api/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, method: 'GET' })
        });
      } else {
        response = await fetch(url);
      }

      if (!response.ok) {
        throw new Error(`Failed to sync time: ${response.status}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        throw new Error('Non-JSON response during time sync');
      }

      const end = Date.now();
      const serverTime = data.serverTime;
      // Offset = ServerTime - (LocalTime + Latency/2)
      this.timeOffset = serverTime - (start + (end - start) / 2);
      console.log(`Binance Time Synced. Offset: ${this.timeOffset}ms`);
    } catch (e) {
      console.error('Failed to sync time with Binance', e);
    }
  }

  getTimeOffset() {
    return this.timeOffset;
  }

  private async request(method: string, path: string, params: any = {}, signed: boolean = false) {
    const timestamp = Math.floor(Date.now() + this.timeOffset);
    const requestParams = { ...params };

    if (signed) {
      requestParams.timestamp = timestamp;
      requestParams.recvWindow = 60000; // Maximum allowed recvWindow
    }

    let queryString = Object.entries(requestParams)
      .map(([key, val]) => `${key}=${val}`)
      .join('&');

    if (signed) {
      const signature = CryptoJS.HmacSHA256(queryString, this.secretKey).toString();
      queryString += `&signature=${signature}`;
    }

    const url = `${this.baseUrl}${path}${queryString ? '?' + queryString : ''}`;
    const headers = {
      'X-MBX-APIKEY': this.apiKey,
    };
    
    try {
      let response;
      let data;

      const fetchOptions: any = {
        method,
        headers,
      };
      if (method !== 'GET' && params && Object.keys(params).length > 0 && !signed) {
        // For non-signed POST/PUT, we might need body, but Binance usually uses query params for FAPI
      }

      if (this.ipSelection === 'proxy') {
        response = await fetch('/api/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, method, headers })
        });
      } else {
        response = await fetch(url, fetchOptions);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        const isHtml = text.trim().toLowerCase().startsWith('<!doctype html') || text.trim().toLowerCase().startsWith('<html');
        if (isHtml) {
          if (this.ipSelection === 'local' && !params._isRetry) {
            console.warn('HTML response received on local, retrying with proxy...');
            this.ipSelection = 'proxy';
            return this.request(method, path, { ...params, _isRetry: true }, signed);
          }
          throw new Error(`Binance API 返回了 HTML 响应 (${response.status})。这通常是因为请求被拦截或重定向。请在设置中确保 "IP 选择" 已设置为 "服务器代理 (Proxy)"。`);
        }
        throw new Error(`Binance API returned non-JSON response (${response.status}): ${text.slice(0, 100)}...`);
      }

      if (!response.ok) {
        // Handle recvWindow error by re-syncing and retrying once
        if (data && data.code === -1021 && !params._isRetry) {
          console.warn('Timestamp error detected, re-syncing time and retrying...');
          await this.syncTime();
          return this.request(method, path, { ...params, _isRetry: true }, signed);
        }

        if (data && data.code === -2015) {
          const serverIp = this.ipSelection === 'proxy' ? await this.getIp() : '本地 IP';
          throw new Error(`币安 API 权限/IP 错误: 请确保已在币安 API 设置中勾选 "允许合约" 权限。如果开启了 IP 限制，请将当前请求 IP (${serverIp}) 加入白名单。`);
        }

        throw new Error(data.msg || `Binance API Error (${response.status})`);
      }

      return data;
    } catch (e: any) {
      if (e.message.includes('Failed to fetch') && !params._isRetry) {
        console.warn('Network error detected, retrying once...');
        if (this.ipSelection === 'local') {
          console.warn('Switching to proxy for retry...');
          this.ipSelection = 'proxy';
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
        return this.request(method, path, { ...params, _isRetry: true }, signed);
      }
      console.error('Binance Request Failed:', e);
      throw e;
    }
  }

  async getExchangeInfo() {
    return this.request('GET', '/fapi/v1/exchangeInfo');
  }

  async getKLines(symbol: string, interval: string, limit: number = 500, startTime?: number, endTime?: number) {
    const params: any = { symbol, interval, limit };
    if (startTime) params.startTime = startTime;
    if (endTime) params.endTime = endTime;
    return this.request('GET', '/fapi/v1/klines', params);
  }

  async getAccountInfo() {
    return this.request('GET', '/fapi/v2/account', {}, true);
  }

  async getPositions() {
    return this.request('GET', '/fapi/v2/positionRisk', {}, true);
  }

  async getOpenOrders(symbol?: string) {
    return this.request('GET', '/fapi/v1/openOrders', symbol ? { symbol } : {}, true);
  }

  async getOpenAlgoOrders(symbol?: string) {
    return this.request('GET', '/fapi/v1/openAlgoOrders', symbol ? { symbol } : {}, true);
  }

  async cancelAlgoOrder(algoId: string) {
    return this.request('DELETE', '/fapi/v1/algoOrder', { algoId }, true);
  }

  async createOrder(params: {
    symbol: string;
    side: 'BUY' | 'SELL';
    type: 'LIMIT' | 'MARKET' | 'STOP_MARKET' | 'TAKE_PROFIT_MARKET';
    quantity?: string;
    price?: string;
    stopPrice?: string;
    timeInForce?: 'GTC' | 'IOC' | 'FOK';
    reduceOnly?: string;
    closePosition?: string;
    workingType?: 'MARK_PRICE' | 'CONTRACT_PRICE';
    priceProtect?: string;
    positionSide?: string;
  }) {
    return this.request('POST', '/fapi/v1/order', params, true);
  }

  async createAlgoOrder(params: {
    symbol: string;
    side: 'BUY' | 'SELL';
    algoType: 'VP' | 'TWAP' | 'CONDITIONAL';
    type: 'STOP_MARKET' | 'TAKE_PROFIT_MARKET';
    quantity?: string;
    stopPrice?: string;
    triggerPrice?: string;
    reduceOnly?: string;
    workingType?: 'MARK_PRICE' | 'CONTRACT_PRICE';
    [key: string]: any;
  }) {
    return this.request('POST', '/fapi/v1/algoOrder', params, true);
  }

  async cancelAllOrders(symbol: string) {
    return this.request('DELETE', '/fapi/v1/allOpenOrders', { symbol }, true);
  }

  async setLeverage(symbol: string, leverage: number) {
    return this.request('POST', '/fapi/v1/leverage', { symbol, leverage }, true);
  }

  async createListenKey() {
    return this.request('POST', '/fapi/v1/listenKey', {}, false);
  }

  async keepAliveListenKey() {
    return this.request('PUT', '/fapi/v1/listenKey', {}, false);
  }

  async getIp() {
    // Fetch from our own backend to get server IP (always useful for whitelisting)
    try {
      const res = await fetch('/api/system/ip');
      const data = await res.json();
      return data.ip || 'Unknown';
    } catch (e) {
      return 'Unknown';
    }
  }
}
