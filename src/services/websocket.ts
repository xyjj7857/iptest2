export class BinanceWS {
  private ws: WebSocket | null = null;
  private url: string;
  private listenKey: string | null = null;
  private onMessage: (data: any) => void;
  private onOpen?: () => void;
  private onClose?: () => void;
  private onError?: (err: any) => void;
  private reconnectTimer: any = null;
  private reconnectAttempts: number = 0;
  private maxReconnectDelay: number = 30000; // 最大重连延迟 30s
  private subscriptions: Set<string> = new Set();

  private pingTimer: any = null;
  private lastPong: number = Date.now();
  private isManualClose: boolean = false;

  constructor(url: string, onMessage: (data: any) => void) {
    this.url = url;
    this.onMessage = onMessage;
  }

  setUrl(url: string) {
    if (this.url !== url) {
      this.url = url;
      if (this.ws) {
        this.isManualClose = false; // 允许自动重连到新 URL
        this.ws.close();
      }
    }
  }

  setListenKey(key: string | null) {
    if (this.listenKey !== key) {
      this.listenKey = key;
      if (this.ws) {
        this.isManualClose = false; // 允许自动重连到新 ListenKey
        this.ws.close();
      }
    }
  }

  connect(onOpen?: () => void, onClose?: () => void, onError?: (err: any) => void) {
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.onError = onError;
    this.isManualClose = false;

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
    }

    // Ensure URL doesn't end with a slash before appending listenKey
    let baseUrl = this.url.endsWith('/') ? this.url.slice(0, -1) : this.url;
    let fullUrl = baseUrl;
    
    if (this.listenKey) {
      fullUrl = `${baseUrl}/${this.listenKey}`;
    }

    console.log('Connecting to WebSocket:', fullUrl);
    try {
      this.ws = new WebSocket(fullUrl);
    } catch (e) {
      console.error('WebSocket Creation Failed:', e);
      if (this.onError) this.onError(e);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      console.log('WebSocket Connected');
      this.reconnectAttempts = 0;
      this.lastPong = Date.now();
      this.startHeartbeat();
      if (this.onOpen) this.onOpen();
      this.resubscribe();
    };

    this.ws.onmessage = (event) => {
      this.lastPong = Date.now();
      
      try {
        const data = JSON.parse(event.data);
        // Binance specific: handle ping from server if any (though usually it's frames)
        if (data.e === 'ping') {
          this.ws?.send(JSON.stringify({ method: 'pong' }));
          return;
        }
        this.onMessage(data);
      } catch (e) {
        // Handle non-JSON messages if any
      }
    };

    this.ws.onclose = (event) => {
      console.log(`WebSocket Closed. Code: ${event.code}, Reason: ${event.reason}`);
      this.stopHeartbeat();
      if (this.onClose) this.onClose();
      if (!this.isManualClose) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (err) => {
      console.error('WebSocket Error:', err);
      if (this.onError) this.onError(err);
      // On error, the onclose will be called, which triggers reconnect
    };
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // 检查是否长时间未收到消息
        const idleTime = Date.now() - this.lastPong;
        if (idleTime > 60000) {
          console.warn(`WebSocket Idle Timeout (${Math.floor(idleTime/1000)}s), reconnecting...`);
          this.ws.close();
          return;
        }

        // 发送应用层 ping (部分环境可能需要)
        try {
          // 币安通常不需要主动发送 ping 字符串，但发送一个空消息或特定格式可以维持连接
          // 这里我们主要依赖 lastPong 检查
        } catch (e) {}
      }
    }, 15000);
  }

  private stopHeartbeat() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.isManualClose) return;
    
    // 指数退避算法: 2s, 4s, 8s, 16s, max 30s
    const delay = Math.min(Math.pow(2, this.reconnectAttempts) * 2000, this.maxReconnectDelay);
    console.log(`Scheduling WebSocket reconnect in ${delay}ms (Attempt ${this.reconnectAttempts + 1})`);
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAttempts++;
      this.connect(this.onOpen, this.onClose, this.onError);
    }, delay);
  }

  subscribe(streams: string[]) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      streams.forEach(s => this.subscriptions.add(s));
      return;
    }

    const payload = {
      method: 'SUBSCRIBE',
      params: streams,
      id: Date.now(),
    };
    this.ws.send(JSON.stringify(payload));
    streams.forEach(s => this.subscriptions.add(s));
  }

  unsubscribe(streams: string[]) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      streams.forEach(s => this.subscriptions.delete(s));
      return;
    }

    const payload = {
      method: 'UNSUBSCRIBE',
      params: streams,
      id: Date.now(),
    };
    this.ws.send(JSON.stringify(payload));
    streams.forEach(s => this.subscriptions.delete(s));
  }

  private resubscribe() {
    if (this.subscriptions.size > 0) {
      this.subscribe(Array.from(this.subscriptions));
    }
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
  }

  get status() {
    if (!this.ws) return 'CLOSED';
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'CONNECTING';
      case WebSocket.OPEN: return 'OPEN';
      case WebSocket.CLOSING: return 'CLOSING';
      case WebSocket.CLOSED: return 'CLOSED';
      default: return 'UNKNOWN';
    }
  }
}
