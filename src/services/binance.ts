import CryptoJS from 'crypto-js';

export class BinanceService {
  private apiKey: string;
  private secretKey: string;
  private baseUrl: string;
  private timeOffset: number = 0;

  constructor(apiKey: string, secretKey: string, baseUrl: string) {
    this.apiKey = apiKey.trim();
    this.secretKey = secretKey.trim();
    this.baseUrl = baseUrl.trim();
    this.syncTime();
  }

  async syncTime() {
    try {
      const start = Date.now();
      const url = `${this.baseUrl}/fapi/v1/time`;
      let data;
      let response;

      response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, method: 'GET' })
      });

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
    
    // Strip internal flags and prepare parameters
    const { _isRetry, ...apiParams } = params;
    const requestParams: any = { ...apiParams };

    if (signed) {
      requestParams.timestamp = timestamp;
      requestParams.recvWindow = 60000;
    }

    // Build query string with proper encoding
    // Note: Binance requires the signature to be calculated on the query string
    const searchParams = new URLSearchParams();
    for (const [key, val] of Object.entries(requestParams)) {
      if (val !== undefined && val !== null) {
        searchParams.append(key, String(val));
      }
    }
    
    let queryString = searchParams.toString();

    if (signed) {
      const signature = CryptoJS.HmacSHA256(queryString, this.secretKey).toString(CryptoJS.enc.Hex);
      queryString += `&signature=${signature}`;
    }

    const url = `${this.baseUrl}${path}${queryString ? '?' + queryString : ''}`;
    const headers = {
      'X-MBX-APIKEY': this.apiKey,
    };
    
    try {
      let response;
      let data;

      // For Binance API, we put all parameters in the URL query string.
      // We do NOT send a JSON body because Binance fapi expects form-urlencoded or empty body for these endpoints.
      // Sending a JSON body via the proxy was causing signature mismatches.
      const proxyPayload: any = { url, method, headers };

      response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proxyPayload)
      });

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        const isHtml = text.trim().toLowerCase().startsWith('<!doctype html') || text.trim().toLowerCase().startsWith('<html');
        if (isHtml) {
          throw new Error(`Binance API 返回了 HTML 响应 (${response.status})。这通常是因为请求被拦截或重定向。`);
        }
        throw new Error(`Binance API returned non-JSON response (${response.status}): ${text.slice(0, 100)}...`);
      }

      if (!response.ok) {
        // Handle recvWindow error by re-syncing and retrying
        const retryCount = params._retryCount || 0;
        if (data && data.code === -1021 && retryCount < 2) {
          console.warn('Timestamp error detected, re-syncing time and retrying...');
          await this.syncTime();
          return this.request(method, path, { ...params, _retryCount: retryCount + 1 }, signed);
        }

        if (data && data.code === -2015) {
          const currentIp = await this.getIp();
          throw new Error(`币安 API 权限/IP 错误: 请确保已在币安 API 设置中勾选 "允许合约" 权限。如果开启了 IP 限制，请将当前请求 IP (${currentIp}) 加入白名单。`);
        }

        throw new Error(data.msg || `Binance API Error (${response.status})`);
      }

      return data;
    } catch (e: any) {
      const isNetworkError = e.message.includes('Failed to fetch') || e.message.includes('NetworkError');
      const retryCount = params._retryCount || 0;
      const maxRetries = 3;

      if (isNetworkError && retryCount < maxRetries) {
        const delay = Math.pow(2, retryCount) * 1000;
        console.warn(`Network error detected, retrying in ${delay}ms... (Attempt ${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.request(method, path, { ...params, _retryCount: retryCount + 1 }, signed);
      }
      
      if (!isNetworkError) {
        console.error('Binance Request Failed:', e);
      }
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
    try {
      const res = await fetch('/api/ip');
      const data = await res.json();
      return data.ip || 'Unknown';
    } catch (e) {
      return 'Unknown';
    }
  }
}
