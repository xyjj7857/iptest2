import { AppSettings, MarketData, Position, Order, LogEntry } from "../types";
import { BinanceService } from "./binance";
import { BinanceWS } from "./websocket";
import { StorageService } from "./storage";

export class StrategyEngine {
  private settings: AppSettings;
  private binance: BinanceService;
  private ws: BinanceWS;
  private masterSwitch: boolean = false;

  // State
  private stage0Results: string[] = [];
  private stage0PResults: string[] = [];
  private stage0PReasons: Map<string, string> = new Map();
  private stage1Results: string[] = [];
  private stage2Results: any[] = [];
  private stage2Failed: any[] = [];
  private cooldowns: Map<string, number> = new Map();
  private activePosition: Position | null = null;
  private activeOrders: Order[] = [];
  private accountInfo: any = null;
  private btcData: any = null;
  private stage2Data: Map<string, any> = new Map();
  private stage2Data15m: Map<string, any> = new Map();
  private stage2Data15mClosed: Map<string, any> = new Map();
  private bestSymbol: any = null;
  private pendingSecondaryOrders: {
    symbol: string;
    entryPrice: number;
    quantity: string;
    targetOpenTime: number;
    triggerTime: number;
    kClosedPeriod: string;
  } | null = null;
  private apiError: string | null = null;
  private symbolInfo: Map<string, any> = new Map();
  private listenKey: string | null = null;
  private listenKeyTimer: any = null;
  private currentSubscriptions: Set<string> = new Set();
  private isStopped: boolean = false;
  private isExecutingMarketClose: boolean = false;

  // Email Notification State
  private consecutiveReverseOrders: number = 0;
  private lastBalanceEmailTime: number = 0;
  private lastReverseEmailTime: number = 0;

  private lastWSMessageTime: number = 0;
  private wsError: string | null = null;
  private ip: string = '加载中...';

  // Timing info for UI
  private scanTimes = {
    stage0Duration: 0,
    stage0PDuration: 0,
    stage1Duration: 0,
    stage2Duration: 0,
    stage0LastStart: 0,
    stage0PLastStart: 0,
    stage1LastStart: 0,
    stage2LastStart: 0,
    stage0NextStart: 0,
    stage0PNextStart: 0,
    stage1NextStart: 0,
    stage2NextStart: 0,
    stage0Countdown: 0,
    stage0PCountdown: 0,
    stage1Countdown: 0,
    stage2Countdown: 0,
    orderNext: 0,
    bestSelectionTime: 0
  };

  // Timers/Intervals
  private mainLoopInterval: any = null;
  private stage0Timer: any = null;
  private stage1Timer: any = null;
  private stage2Timer: any = null;

  // Callbacks for UI updates
  private onUpdate: (state: any) => void;

  constructor(settings: AppSettings, onUpdate: (state: any) => void) {
    this.settings = settings;
    this.onUpdate = onUpdate;
    this.binance = new BinanceService(
      settings.binance.apiKey,
      settings.binance.secretKey,
      settings.binance.baseUrl
    );
    this.binance.setIpSelection(settings.ipSelection);
    this.ws = new BinanceWS(settings.binance.wsUrl, this.handleWSMessage.bind(this));
    this.masterSwitch = settings.masterSwitch;

    // Restore state if available
    const savedState = StorageService.getState();
    if (savedState) {
      this.stage0Results = savedState.stage0Results || [];
      this.stage0PResults = savedState.stage0PResults || [];
      this.stage1Results = savedState.stage1Results || [];
      this.cooldowns = new Map(Object.entries(savedState.cooldowns || {}));
      this.consecutiveReverseOrders = savedState.consecutiveReverseOrders || 0;
      if (savedState.activePosition) {
        this.activePosition = savedState.activePosition;
      }
    }
  }

  async start() {
    if (this.mainLoopInterval || this.isStopped) return; // Already started or stopped
    
    // Fetch initial IP
    this.binance.getIp().then(ip => {
      this.ip = ip;
      this.notifyUI();
    });

    this.startTimers();

    if (this.masterSwitch) {
      // 1. Sync Time
      await this.binance.syncTime();
      if (this.isStopped) return;
      
      // 2. Refresh Exchange Info
      await this.refreshExchangeInfo();
      if (this.isStopped) return;

      // 3. Setup User Data Stream
      await this.setupUserDataStream();
      if (this.isStopped) return;

      // 4. Connect WebSocket
      this.ws.connect(
        () => {
          this.wsError = null;
          this.notifyUI();
          this.updateSubscriptions();
        },
        () => {
          this.notifyUI();
        },
        (err) => {
          this.wsError = 'WebSocket 连接失败，请检查地址或网络';
          this.notifyUI();
        }
      );
      
      this.refreshAccountInfo();
      
      // Run first Stage 0 scan on startup
      this.runStage0();
    }
  }

  private async setupUserDataStream() {
    if (!this.masterSwitch || this.isStopped) return;
    try {
      const res = await this.binance.createListenKey();
      if (this.isStopped) return;
      if (res && res.listenKey) {
        this.listenKey = res.listenKey;
        this.ws.setListenKey(this.listenKey);
        
        // Keep alive every 30 mins
        if (this.listenKeyTimer) clearInterval(this.listenKeyTimer);
        this.listenKeyTimer = setInterval(() => {
          if (this.isStopped || !this.masterSwitch) return;
          this.binance.keepAliveListenKey().catch(console.error);
        }, 30 * 60 * 1000);
      }
    } catch (e: any) {
      console.error('Failed to create listenKey', e);
      this.apiError = e.message;
      
      // Extract IP from error if present
      if (e.message.includes('request ip:')) {
        const match = e.message.match(/request ip: ([\d\.]+)/);
        if (match && match[1]) {
          this.ip = match[1];
        }
      }
      this.notifyUI();
    }
  }

  public stop() {
    this.isStopped = true;
    if (this.mainLoopInterval) clearInterval(this.mainLoopInterval);
    if (this.refreshInterval) clearInterval(this.refreshInterval);
    if (this.syncInterval) clearInterval(this.syncInterval);
    if (this.listenKeyTimer) clearInterval(this.listenKeyTimer);
    this.mainLoopInterval = null;
    this.refreshInterval = null;
    this.syncInterval = null;
    this.listenKeyTimer = null;
    this.ws.close();
  }

  private updateSubscriptions() {
    const needed = new Set<string>();
    
    if (this.masterSwitch) {
      needed.add('btcusdt@kline_15m');

      // Active position
      if (this.activePosition) {
        needed.add(`${this.activePosition.symbol.toLowerCase()}@kline_5m`);
      }

      // Stage 2 candidates (Stage 1 results)
      this.stage1Results.forEach(s => {
        const sym = s.toLowerCase();
        needed.add(`${sym}@kline_5m`);
        needed.add(`${sym}@kline_15m`);
        if (this.settings.scanner.stage2Period !== '5m' && this.settings.scanner.stage2Period !== '15m') {
          needed.add(`${sym}@kline_${this.settings.scanner.stage2Period}`);
        }
      });
    }

    // Unsubscribe old, subscribe new
    const toUnsubscribe = Array.from(this.currentSubscriptions).filter(s => !needed.has(s));
    const toSubscribe = Array.from(needed).filter(s => !this.currentSubscriptions.has(s));

    if (toUnsubscribe.length > 0) this.ws.unsubscribe(toUnsubscribe);
    if (toSubscribe.length > 0) this.ws.subscribe(toSubscribe);

    this.currentSubscriptions = needed;
  }

  private async refreshExchangeInfo() {
    if (!this.masterSwitch) return;
    try {
      const info = await this.binance.getExchangeInfo();
      info.symbols.forEach((s: any) => {
        this.symbolInfo.set(s.symbol, s);
      });
    } catch (e) {
      console.error('Failed to refresh exchange info', e);
    }
  }

  private refreshInterval: any = null;
  private syncInterval: any = null;

  private startTimers() {
    if (this.mainLoopInterval) clearInterval(this.mainLoopInterval);
    this.mainLoopInterval = setInterval(() => this.checkSchedules(), 100);
    
    // Refresh account info every 5s
    if (this.refreshInterval) clearInterval(this.refreshInterval);
    this.refreshInterval = setInterval(() => this.refreshAccountInfo(), 5000);

    // Sync time every 30 minutes to prevent drift (Removed: will sync after Stage 1)
    if (this.syncInterval) clearInterval(this.syncInterval);
    // this.syncInterval = setInterval(() => this.binance.syncTime(), 30 * 60 * 1000);
  }

  private lastRunBlock = {
    stage0: -1,
    stage0P: -1,
    stage1: -1,
    stage2: -1,
    order: -1
  };

  private isScanning = {
    stage0: false,
    stage0P: false,
    stage1: false,
    stage2: false,
    stage0Progress: 0,
    stage0PProgress: 0,
    stage1Progress: 0,
    stage2Progress: 0
  };

  private parsePeriod(period: string): number {
    const val = parseInt(period);
    if (period.endsWith('h')) return val * 3600;
    if (period.endsWith('m')) return val * 60;
    if (period.endsWith('s')) return val;
    return 900; // Default 15m
  }

  private parseOffset(offset: string): number {
    const parts = offset.split(':').map(parseFloat);
    if (parts.length === 2) {
      // mm:ss.SSS
      return parts[0] * 60 + parts[1];
    }
    if (parts.length === 3) {
      // HH:mm:ss.SSS
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
  }

  private checkSchedules() {
    const serverTime = Date.now() + this.binance.getTimeOffset();
    const serverSeconds = serverTime / 1000;

    // 1. Stage 0
    const p0 = this.parsePeriod(this.settings.scanner.stage0Period);
    const o0_raw = this.parseOffset(this.settings.scanner.stage0StartTime);
    const o0 = o0_raw % p0;
    const block0 = Math.floor(serverSeconds / p0);
    const offset0 = serverSeconds % p0;
    
    const next0 = (block0 + (offset0 >= o0 ? 1 : 0)) * p0 * 1000 + o0 * 1000 - this.binance.getTimeOffset();
    this.scanTimes.stage0NextStart = next0;
    this.scanTimes.stage0Countdown = Math.max(0, Math.floor((next0 - Date.now()) / 1000));

    // 1.5 Stage 0P
    const p0p = this.parsePeriod(this.settings.scanner.stage0PPeriod);
    const o0p_raw = this.parseOffset(this.settings.scanner.stage0PStartTime);
    const o0p = o0p_raw % p0p;
    const block0p = Math.floor(serverSeconds / p0p);
    const offset0p = serverSeconds % p0p;
    
    const next0p = (block0p + (offset0p >= o0p ? 1 : 0)) * p0p * 1000 + o0p * 1000 - this.binance.getTimeOffset();
    this.scanTimes.stage0PNextStart = next0p;
    this.scanTimes.stage0PCountdown = Math.max(0, Math.floor((next0p - Date.now()) / 1000));

    // 2. Stage 1
    const p1 = this.parsePeriod(this.settings.scanner.stage1Period);
    const o1_raw = this.parseOffset(this.settings.scanner.stage1StartTime);
    const o1 = o1_raw % p1;
    const block1 = Math.floor(serverSeconds / p1);
    const offset1 = serverSeconds % p1;
    
    const next1 = (block1 + (offset1 >= o1 ? 1 : 0)) * p1 * 1000 + o1 * 1000 - this.binance.getTimeOffset();
    this.scanTimes.stage1NextStart = next1;
    this.scanTimes.stage1Countdown = Math.max(0, Math.floor((next1 - Date.now()) / 1000));

    // 3. Stage 2
    const p2 = this.parsePeriod(this.settings.scanner.stage2Period);
    const o2_raw = this.parseOffset(this.settings.scanner.stage2StartTime);
    const o2 = o2_raw % p2;
    const block2 = Math.floor(serverSeconds / p2);
    const offset2 = serverSeconds % p2;
    
    const next2 = (block2 + (offset2 >= o2 ? 1 : 0)) * p2 * 1000 + o2 * 1000 - this.binance.getTimeOffset();
    this.scanTimes.stage2NextStart = next2;
    this.scanTimes.stage2Countdown = Math.max(0, Math.floor((next2 - Date.now()) / 1000));

    // 4. Order Execution
    const po = this.parsePeriod(this.settings.order.period);
    const oo_raw = this.parseOffset(this.settings.order.startTime);
    const oo = oo_raw % po;
    const blocko = Math.floor(serverSeconds / po);
    const offseto = serverSeconds % po;
    
    const nexto = (blocko + (offseto >= oo ? 1 : 0)) * po * 1000 + oo * 1000 - this.binance.getTimeOffset();
    this.scanTimes.orderNext = nexto;

    // Only execute if master switch is on
    if (this.masterSwitch) {
      if (offset0 >= o0 && this.lastRunBlock.stage0 !== block0) {
        this.lastRunBlock.stage0 = block0;
        StorageService.addLog({ module: 'Scanner', type: 'scanner', message: '倒计时归零，执行强制扫零' });
        this.runStage0();
      }
      
      if (offset0p >= o0p && this.lastRunBlock.stage0P !== block0p) {
        this.lastRunBlock.stage0P = block0p;
        StorageService.addLog({ module: 'Scanner', type: 'scanner', message: '倒计时归零，执行第0阶段扫描' });
        this.runStage0P();
      }

      if (offset1 >= o1 && this.lastRunBlock.stage1 !== block1) {
        this.lastRunBlock.stage1 = block1;
        StorageService.addLog({ module: 'Scanner', type: 'scanner', message: '倒计时归零，执行强制扫一' });
        this.runStage1();
      }

      if (offset2 >= o2 && this.lastRunBlock.stage2 !== block2) {
        this.lastRunBlock.stage2 = block2;
        // Add a small delay (e.g., 2 seconds) to ensure the kline is closed and pushed by Binance
        const delay = 2000;
        setTimeout(() => {
          StorageService.addLog({ module: 'Scanner', type: 'scanner', message: '倒计时归零，执行强制扫二' });
          this.runStage2();
        }, delay);
      }

      if (this.bestSymbol && !this.bestSymbol.isProcessed && !this.activePosition) {
        const windowEnd = oo + this.settings.order.forwardOrderWindow;
        
        // Verify if the best symbol belongs to the current order block
        const symbolBlock = Math.floor((this.scanTimes.bestSelectionTime + this.binance.getTimeOffset()) / 1000 / po);
        
        if (symbolBlock === blocko) {
          if (offseto >= oo && offseto <= windowEnd) {
            if (this.lastRunBlock.order !== blocko) {
              this.lastRunBlock.order = blocko;
              StorageService.addLog({ 
                module: 'Order', 
                type: 'order', 
                message: `到达下单窗口期，执行下单: ${this.bestSymbol.symbol} (当前偏移: ${offseto?.toFixed(1)}s, 窗口: ${oo}-${windowEnd}s)` 
              });
              this.executeTrade(this.bestSymbol);
              this.bestSymbol.isProcessed = true;
              this.bestSymbol.processStatus = 'ordered';
            }
          } else if (offseto > windowEnd) {
            // Discard if past window
            StorageService.addLog({ 
              module: 'Order', 
              type: 'order', 
              message: `当前时间 (${offseto?.toFixed(1)}s) 已超过下单窗口期 (${windowEnd}s)，放弃本次下单: ${this.bestSymbol.symbol}` 
            });
            this.bestSymbol.isProcessed = true;
            this.bestSymbol.processStatus = 'missed';
          }
        } else if (symbolBlock < blocko) {
          // Stale symbol from previous block, mark as processed
          this.bestSymbol.isProcessed = true;
          this.bestSymbol.processStatus = 'stale';
        }
      }
    }
    
    // 5. Pending Secondary Orders
    if (this.pendingSecondaryOrders && this.masterSwitch) {
      if (serverTime >= this.pendingSecondaryOrders.triggerTime) {
        const offsetClosed = serverSeconds % this.parsePeriod(this.settings.order.kClosedPeriod);
        
        // 确保在窗口期内执行，或者如果已经错过窗口期但 triggerTime 已过且 offset 还在合理范围内
        if (offsetClosed >= this.settings.order.kClosedWindowStart && offsetClosed <= this.settings.order.kClosedWindowEnd) {
          const pending = this.pendingSecondaryOrders;
          this.pendingSecondaryOrders = null;
          this.placeSecondaryOrders(pending);
        }
      }
    }
    
    this.notifyUI();
  }

  private async refreshAccountInfo() {
    if (!this.masterSwitch) return;
    try {
      const info = await this.binance.getAccountInfo();
      if (!info) throw new Error('Empty account info');
      
      this.accountInfo = info;
      this.apiError = null;

      // Check Balance Limit
      if (this.settings.email.enabled && this.settings.email.balanceLimitEnabled) {
        const balance = parseFloat(info.totalWalletBalance);
        if (balance >= this.settings.email.balanceLimit) {
          // Send email if not sent in the last hour to avoid spam
          if (Date.now() - this.lastBalanceEmailTime > 3600000) {
            this.sendEmailNotification('账户余额达到或超过设定值');
            this.lastBalanceEmailTime = Date.now();
          }
        }
      }
      
      const [orders, algoOrders] = await Promise.all([
        this.binance.getOpenOrders(),
        this.binance.getOpenAlgoOrders()
      ]);

      const active = info.positions.find((p: any) => parseFloat(p.positionAmt) !== 0);
      const prevActive = this.activePosition;

      if (active) {
        this.activePosition = {
          symbol: active.symbol,
          side: parseFloat(active.positionAmt) > 0 ? 'BUY' : 'SELL',
          amount: Math.abs(parseFloat(active.positionAmt)),
          leverage: parseInt(active.leverage),
          entryPrice: parseFloat(active.entryPrice),
          markPrice: parseFloat(active.markPrice),
          unrealizedProfit: parseFloat(active.unRealizedProfit),
          updateTime: Date.now(),
          entryTime: active.updateTime,
        };

        // NEW: Check for max hold time
        if (this.settings.order.maxHoldTime > 0) {
          const holdTimeMs = Date.now() - this.activePosition.entryTime;
          if (holdTimeMs > this.settings.order.maxHoldTime * 60000) {
            StorageService.addLog({ 
              module: 'Order', 
              type: 'order', 
              message: `达到最大持仓时间 (${this.settings.order.maxHoldTime}分钟)，执行平仓: ${this.activePosition.symbol}` 
            });
            this.executeMarketClose(); // Execute market close
          }
        }
      } else {
        // If we had a position and now we don't, cancel all orders
        if (prevActive) {
          await this.binance.cancelAllOrders(prevActive.symbol);
          StorageService.addLog({ module: 'Order', type: 'order', message: `持仓已关闭，撤销所有委托单: ${prevActive.symbol}` });
          
          // 撤销所有算法单 (止损单/策略单)
          await this.cancelAllAlgoOrders(prevActive.symbol);
          
          // Check if it was a loss (Reverse Order)
          if (prevActive.unrealizedProfit < 0) {
            this.consecutiveReverseOrders++;
            if (this.settings.email.enabled && this.settings.email.reverseOrderLimitEnabled) {
              if (this.consecutiveReverseOrders >= this.settings.email.reverseOrderLimit) {
                if (Date.now() - this.lastReverseEmailTime > 3600000) {
                  this.sendEmailNotification('连续反向单达到上限');
                  this.lastReverseEmailTime = Date.now();
                }
              }
            }
          } else {
            this.consecutiveReverseOrders = 0;
          }
        } else {
          // 如果当前没有持仓，且存在残留的算法单，也进行清理 (根据用户需求：没有持仓时撤销所有algo订单)
          const currentAlgoOrders = Array.isArray(algoOrders) ? algoOrders : (algoOrders?.orders || []);
          if (currentAlgoOrders.length > 0) {
            for (const o of currentAlgoOrders) {
              try {
                await this.binance.cancelAlgoOrder(o.algoId);
                StorageService.addLog({ module: 'Order', type: 'order', message: `无持仓，自动清理残留算法单: ${o.symbol} (${o.algoId})` });
              } catch (e) {
                // 忽略单个撤单失败 下一轮 5s 轮询会再次尝试
              }
            }
          }
        }
        this.activePosition = null;
      }

      const standardOrders = orders.map((o: any) => {
        const pos = info.positions.find((p: any) => p.symbol === o.symbol);
        return {
          symbol: o.symbol,
          orderId: o.orderId,
          side: o.side,
          type: o.type,
          amount: parseFloat(o.origQty),
          price: parseFloat(o.price || o.stopPrice || '0'),
          time: o.time,
          leverage: pos ? parseInt(pos.leverage) : undefined,
        };
      });

      const algoOrdersList = Array.isArray(algoOrders) ? algoOrders : (algoOrders?.orders || []);
      const processedAlgoOrders = algoOrdersList.map((o: any) => {
        const pos = info.positions.find((p: any) => p.symbol === o.symbol);
        return {
          symbol: o.symbol,
          orderId: o.algoId,
          side: o.side,
          type: `ALGO_${o.algoType}_${o.type}`,
          amount: parseFloat(o.quantity),
          price: parseFloat(o.stopPrice || o.triggerPrice || '0'),
          time: o.time,
          leverage: pos ? parseInt(pos.leverage) : undefined,
        };
      });

      this.activeOrders = [...standardOrders, ...processedAlgoOrders];

      this.notifyUI();
      this.saveState();
    } catch (e: any) {
      console.error('Failed to refresh account info', e);
      this.apiError = e.message;
      
      // Extract IP from error if present
      if (e.message.includes('request ip:')) {
        const match = e.message.match(/request ip: ([\d\.]+)/);
        if (match && match[1]) {
          this.ip = match[1];
        }
      }
      
      this.notifyUI();
    }
  }

  private async handleWSMessage(data: any) {
    this.lastWSMessageTime = Date.now();

    // Log user data events for debugging
    if (data.e === 'ACCOUNT_UPDATE' || data.e === 'ORDER_TRADE_UPDATE') {
      console.log('User Data Event:', data.e);
    }

    // 1. User Data Stream Events
    if (data.e === 'ACCOUNT_UPDATE') {
      // Direct update from WS for better responsiveness
      if (data.a && data.a.B) {
        const usdtBalance = data.a.B.find((b: any) => b.a === 'USDT');
        if (usdtBalance && this.accountInfo) {
          this.accountInfo.totalWalletBalance = usdtBalance.wb;
          this.accountInfo.availableBalance = usdtBalance.cw;
        }
      }
      // Always refresh on account update to ensure consistency
      await this.refreshAccountInfo();
    }

    if (data.e === 'ORDER_TRADE_UPDATE') {
      await this.refreshAccountInfo();
    }

    // 2. Market Data Events
    if (data.e === 'kline') {
      const symbol = data.s.toLowerCase();
      const k = data.k;
      
      if (symbol === 'btcusdt' && k.i === '15m') {
        this.btcData = k;
      }
      
      // Update stage 2 data
      // 优化：如果 K 线已收盘(k.x)，则强制覆盖；如果是走动中，仅在没有数据时初始化
      if (k.i === '5m') {
        if (k.x || !this.stage2Data.has(symbol)) {
          this.stage2Data.set(symbol, k);
        }
      } else if (k.i === '15m') {
        // 始终更新最新数据用于第二阶段过滤判断
        const prev = this.stage2Data15m.get(symbol);
        if (prev && prev.t !== k.t) {
          // K线切换了，之前的 K 线现在是“已完结”的
          this.stage2Data15mClosed.set(symbol, prev);
        }
        this.stage2Data15m.set(symbol, k);
        
        // 如果是已收盘的 K 线（由币安标记），也记录到已收盘 Map 中
        if (k.x) {
          this.stage2Data15mClosed.set(symbol, k);
        }
      }

      // Check if this is our active position symbol
      if (this.activePosition && this.activePosition.symbol.toLowerCase() === symbol) {
        const currentPrice = parseFloat(k.c);
        
        // Update active position price and PnL in real-time
        this.activePosition.markPrice = currentPrice;
        this.activePosition.updateTime = Date.now();
        
        const diff = this.activePosition.side === 'BUY' 
          ? (currentPrice - this.activePosition.entryPrice) 
          : (this.activePosition.entryPrice - currentPrice);
        this.activePosition.unrealizedProfit = diff * this.activePosition.amount;

        // Check SL if we have a position in this symbol
        // Check if we need to execute SL (if not already handled by Binance SL order)
        // Usually we rely on Binance SL orders, but this is a fallback
      }
      
      this.notifyUI();
    }
  }

  private async executeMarketClose() {
    if (!this.activePosition || this.isExecutingMarketClose) return;
    this.isExecutingMarketClose = true;

    const symbol = this.activePosition.symbol;
    const amount = this.activePosition.amount;
    const leverage = this.activePosition.leverage;

    StorageService.addLog({ 
      module: 'Order', 
      type: 'order', 
      message: `执行市价平仓: ${symbol}, 数量: ${amount}, 杠杆: ${leverage}` 
    });

    try {
      // Ensure leverage is still correct (though it should be)
      await this.binance.setLeverage(symbol, leverage);
      
      await this.binance.createOrder({
        symbol,
        side: 'SELL',
        type: 'MARKET',
        quantity: this.formatQuantity(symbol, amount),
        positionSide: 'BOTH'
      });
      
      await this.binance.cancelAllOrders(symbol);
      await this.cancelAllAlgoOrders(symbol);
      this.activePosition = null;
      this.isExecutingMarketClose = false;

      this.refreshAccountInfo();
      StorageService.addLog({ module: 'Order', type: 'order', message: `市价平仓订单已成交: ${symbol}` });
    } catch (e: any) {
      this.isExecutingMarketClose = false;
      StorageService.addLog({ module: 'Order', type: 'error', message: `市价平仓执行失败: ${e.message}` });
    }
  }

  private async cancelAllAlgoOrders(symbol: string) {
    try {
      const algoOrders = await this.binance.getOpenAlgoOrders(symbol);
      const orders = Array.isArray(algoOrders) ? algoOrders : (algoOrders.orders || []);
      
      if (orders.length > 0) {
        StorageService.addLog({ module: 'Order', type: 'order', message: `发现 ${orders.length} 个算法单，准备撤销: ${symbol}` });
        for (const order of orders) {
          await this.binance.cancelAlgoOrder(order.algoId);
          StorageService.addLog({ module: 'Order', type: 'order', message: `算法单 ${order.algoId} 撤销成功: ${symbol}` });
        }
      }
    } catch (e: any) {
      console.error("清理算法单失败", e);
      StorageService.addLog({ module: 'Order', type: 'error', message: `清理算法单失败: ${e.message}` });
    }
  }

  private formatPrice(symbol: string, price: number): string {
    const info = this.symbolInfo.get(symbol);
    if (!info) return (price || 0).toString();
    
    const filter = info.filters?.find((f: any) => f.filterType === 'PRICE_FILTER');
    if (filter && filter.tickSize) {
      const tickSize = parseFloat(filter.tickSize);
      const precision = filter.tickSize.indexOf('.') > -1 ? filter.tickSize.split('.')[1].length : 0;
      const rounded = Math.round(price / tickSize) * tickSize;
      return rounded?.toFixed(precision);
    }
    
    return price?.toFixed(info.pricePrecision || 8);
  }

  private formatQuantity(symbol: string, qty: number): string {
    const info = this.symbolInfo.get(symbol);
    if (!info) return (qty || 0).toString();
    
    const filter = info.filters?.find((f: any) => f.filterType === 'LOT_SIZE');
    if (filter && filter.stepSize) {
      const stepSize = parseFloat(filter.stepSize);
      const precision = filter.stepSize.indexOf('.') > -1 ? filter.stepSize.split('.')[1].length : 0;
      // Use floor for quantity to be safe against balance limits
      const rounded = Math.floor(qty / stepSize + 0.0000001) * stepSize;
      return rounded?.toFixed(precision);
    }
    
    return qty?.toFixed(info.quantityPrecision || 8);
  }

  // --- Stage 0: Full Market Scan ---
  public async runStage0() {
    if (!this.masterSwitch || this.isScanning.stage0) return;

    this.isScanning.stage0 = true;
    this.isScanning.stage0Progress = 0;
    this.scanTimes.stage0LastStart = Date.now();
    this.notifyUI();

    StorageService.addLog({ module: 'Scanner', type: 'scanner', message: '开始全市场扫描 (Stage 0)' });
    const startTime = Date.now();
    try {
      const exchangeInfo = await this.binance.getExchangeInfo();
      this.isScanning.stage0Progress = 50;
      this.notifyUI();
      
      const serverTime = Date.now() + this.binance.getTimeOffset();

      const results: string[] = [];
      if (!exchangeInfo || !exchangeInfo.symbols) {
        StorageService.addLog({ module: 'Scanner', type: 'error', message: '获取交易规则失败: exchangeInfo 数据格式错误' });
        this.isScanning.stage0 = false;
        this.notifyUI();
        return;
      }

      const customMinutes = this.settings.scanner.stage0CustomMinutes || 15;
      const intervalMs = customMinutes * 60 * 1000;

      exchangeInfo.symbols.forEach((s: any) => {
        if (s.quoteAsset === 'USDT' && s.contractType === 'PERPETUAL' && s.status === 'TRADING') {
          const onboardDate = s.onboardDate;
          if (onboardDate && onboardDate > 0) {
            const kCount = Math.floor((serverTime - onboardDate) / intervalMs);
            if (kCount >= this.settings.scanner.stage0KCountMin && kCount <= this.settings.scanner.stage0KCountMax) {
              results.push(s.symbol);
            }
          } else {
            // 如果没有上线时间或上线时间无效，默认包含
            results.push(s.symbol);
          }
        }
      });

      results.sort();
      this.stage0Results = results;
      this.scanTimes.stage0Duration = Date.now() - startTime;
      this.saveState();
      StorageService.addLog({ 
        module: 'Scanner', 
        type: 'scanner', 
        message: `全市场扫描完成，耗时 ${Date.now() - startTime}ms，总扫描币对: ${exchangeInfo.symbols.length}，符合条件币对: ${results.length}` 
      });

      // If Stage 0P is disabled, update stage0PResults immediately
      if (!this.settings.scanner.stage0PEnabled) {
        this.stage0PResults = [...results];
        this.stage0PReasons.clear();
        this.notifyUI();
      }
    } catch (e: any) {
      StorageService.addLog({ module: 'Scanner', type: 'error', message: `全市场扫描失败: ${e.message}` });
    } finally {
      this.isScanning.stage0 = false;
      this.isScanning.stage0Progress = 100;
      this.notifyUI();
    }
  }

  // --- Stage 0P: Volatility Filter ---
  public async runStage0P() {
    if (!this.masterSwitch || this.isScanning.stage0P) return;
    
    if (!this.settings.scanner.stage0PEnabled) {
      this.stage0PResults = [...this.stage0Results];
      this.stage0PReasons.clear();
      this.notifyUI();
      return;
    }

    this.isScanning.stage0P = true;
    this.isScanning.stage0PProgress = 0;
    this.scanTimes.stage0PLastStart = Date.now();
    this.notifyUI();

    StorageService.addLog({ module: 'Scanner', type: 'scanner', message: '开始第0阶段扫描 (Stage 0P)' });
    const startTime = Date.now();
    
    try {
      const targets = [...this.stage0Results];
      const results: string[] = [];
      const reasons: Map<string, string> = new Map();
      
      const total = targets.length;
      for (let i = 0; i < targets.length; i += 20) {
        const batch = targets.slice(i, i + 20);
        await Promise.all(batch.map(async (symbol) => {
          try {
            let isOk = true;
            let reason = '';

            // Check 15m
            if (this.settings.scanner.stage0P15mEnabled) {
              const klines = await this.binance.getKLines(symbol, '15m', this.settings.scanner.stage0P15mCount + 1);
              const completed = klines.slice(0, -1);
              for (const k of completed) {
                const change = Math.abs(((parseFloat(k[4]) - parseFloat(k[1])) / parseFloat(k[1])) * 100);
                if (change >= this.settings.scanner.stage0P15mRef) {
                  isOk = false;
                  reason = `15m K线涨跌幅 ${change.toFixed(2)}% >= 参考值 ${this.settings.scanner.stage0P15mRef}%`;
                  break;
                }
              }
            }

            // Check 1h
            if (isOk && this.settings.scanner.stage0P1hEnabled) {
              const klines = await this.binance.getKLines(symbol, '1h', this.settings.scanner.stage0P1hCount + 1);
              const completed = klines.slice(0, -1);
              for (const k of completed) {
                const change = Math.abs(((parseFloat(k[4]) - parseFloat(k[1])) / parseFloat(k[1])) * 100);
                if (change >= this.settings.scanner.stage0P1hRef) {
                  isOk = false;
                  reason = `1h K线涨跌幅 ${change.toFixed(2)}% >= 参考值 ${this.settings.scanner.stage0P1hRef}%`;
                  break;
                }
              }
            }

            // Check 4h
            if (isOk && this.settings.scanner.stage0P4hEnabled) {
              const klines = await this.binance.getKLines(symbol, '4h', this.settings.scanner.stage0P4hCount + 1);
              const completed = klines.slice(0, -1);
              for (const k of completed) {
                const change = Math.abs(((parseFloat(k[4]) - parseFloat(k[1])) / parseFloat(k[1])) * 100);
                if (change >= this.settings.scanner.stage0P4hRef) {
                  isOk = false;
                  reason = `4h K线涨跌幅 ${change.toFixed(2)}% >= 参考值 ${this.settings.scanner.stage0P4hRef}%`;
                  break;
                }
              }
            }

            // Check Day
            if (isOk && this.settings.scanner.stage0PDayEnabled) {
              const klines = await this.binance.getKLines(symbol, '1d', this.settings.scanner.stage0PDayCount + 1);
              const completed = klines.slice(0, -1);
              for (const k of completed) {
                const change = Math.abs(((parseFloat(k[4]) - parseFloat(k[1])) / parseFloat(k[1])) * 100);
                if (change >= this.settings.scanner.stage0PDayRef) {
                  isOk = false;
                  reason = `日线 K线涨跌幅 ${change.toFixed(2)}% >= 参考值 ${this.settings.scanner.stage0PDayRef}%`;
                  break;
                }
              }
            }

            if (isOk) {
              results.push(symbol);
            } else {
              reasons.set(symbol, reason);
            }
          } catch (e) {
            // Ignore single symbol failure
          }
        }));
        this.isScanning.stage0PProgress = Math.min(100, ((i + 20) / total) * 100);
        this.notifyUI();
      }

      results.sort();
      this.stage0PResults = results;
      this.stage0PReasons = reasons;
      this.scanTimes.stage0PDuration = Date.now() - startTime;
      this.saveState();
      
      StorageService.addLog({ 
        module: 'Scanner', 
        type: 'scanner', 
        message: `第0阶段扫描完成，耗时 ${Date.now() - startTime}ms，总扫描币对: ${targets.length}，符合条件币对: ${results.length}` 
      });
    } catch (e: any) {
      StorageService.addLog({ module: 'Scanner', type: 'error', message: `第0阶段扫描失败: ${e.message}` });
    } finally {
      this.isScanning.stage0P = false;
      this.isScanning.stage0PProgress = 100;
      this.notifyUI();
    }
  }

  // --- Stage 1: Filter Stage 0 Results ---
  public async runStage1() {
    if (!this.masterSwitch || this.isScanning.stage1) return;

    // Clear bestSymbol only when Stage 1 starts
    this.bestSymbol = null;

    this.isScanning.stage1 = true;
    this.isScanning.stage1Progress = 0;
    this.scanTimes.stage1LastStart = Date.now();
    this.notifyUI();

    StorageService.addLog({ module: 'Scanner', type: 'scanner', message: '开始第一阶段扫描 (Stage 1)' });
    const startTime = Date.now();
    try {
      const whitelist = this.settings.scanner.whitelist.split(' ').filter(s => s);
      const blacklist = this.settings.scanner.blacklist.split(' ').filter(s => s);
      
      let targets = [...this.stage0PResults];
      if (whitelist.length > 0) targets = [...new Set([...targets, ...whitelist])];
      targets = targets.filter(s => !blacklist.includes(s));

      const results: string[] = [];
      const total = targets.length;
      for (let i = 0; i < targets.length; i += 20) {
        const batch = targets.slice(i, i + 20);
        await Promise.all(batch.map(async (symbol: string) => {
          try {
            const klines = await this.binance.getKLines(symbol, this.settings.scanner.stage1Period, 1);
            if (klines.length > 0) {
              const [time, open, high, low, close, volume, closeTime, quoteVolume] = klines[0];
              const km1 = parseFloat(quoteVolume); // 使用 USDT 成交额 (索引 7)
              const k1 = ((parseFloat(close) - parseFloat(open)) / parseFloat(open)) * 100;

              let match = true;
              if (this.settings.scanner.stage1Cond1Enabled && km1 < this.settings.scanner.stage1MinVolume) match = false;
              if (this.settings.scanner.stage1Cond2Enabled && (k1 < this.settings.scanner.stage1KLineMin || k1 > this.settings.scanner.stage1KLineMax)) match = false;

              if (match) results.push(symbol);
            }
          } catch (e) {
            // Ignore single symbol failure
          }
        }));
        this.isScanning.stage1Progress = Math.min(100, ((i + 20) / total) * 100);
        this.notifyUI();
      }

      results.sort();
      this.stage1Results = results;
      this.scanTimes.stage1Duration = Date.now() - startTime;
      this.saveState();
      this.updateSubscriptions();

      // Sync time after each Stage 1 scan to keep clock accurate
      await this.binance.syncTime();

      StorageService.addLog({ 
        module: 'Scanner', 
        type: 'scanner', 
        message: `第一阶段扫描完成并同步时间，耗时 ${Date.now() - startTime}ms，总扫描币对: ${targets.length}，符合条件币对: ${results.length}` 
      });
    } catch (e: any) {
      StorageService.addLog({ module: 'Scanner', type: 'error', message: `第一阶段扫描失败: ${e.message}` });
    } finally {
      this.isScanning.stage1 = false;
      this.notifyUI();
    }
  }

  // --- Stage 2: Real-time Filtering ---
  public async runStage2() {
    if (!this.masterSwitch || this.isScanning.stage2) return;

    this.isScanning.stage2 = true;
    this.isScanning.stage2Progress = 0;
    this.scanTimes.stage2LastStart = Date.now();
    this.notifyUI();

    StorageService.addLog({ module: 'Scanner', type: 'scanner', message: '开始第二阶段扫描 (Stage 2)' });
    const startTime = Date.now();
    
    try {
      const candidates: any[] = [];
      const failed: any[] = [];
      const total = this.stage1Results.length;
      let processed = 0;

      for (const symbol of this.stage1Results) {
        processed++;
        this.isScanning.stage2Progress = (processed / total) * 100;
        if (processed % 5 === 0) this.notifyUI();

        const k5 = this.stage2Data.get(symbol.toLowerCase());
        const k15 = this.stage2Data15m.get(symbol.toLowerCase());
        const k15Closed = this.stage2Data15mClosed.get(symbol.toLowerCase());
        
        if (!k5 || !k15) {
          failed.push({ symbol, reason: !k5 ? '无5mK线数据' : '无15mK线数据' });
          continue;
        }

        const serverTime = Date.now() + this.binance.getTimeOffset();
        const p5 = 5 * 60 * 1000;
        const p15 = 15 * 60 * 1000;
        const current5mStart = Math.floor(serverTime / p5) * p5;
        const current15mStart = Math.floor(serverTime / p15) * p15;

        // 校验 K线是否属于当前周期，确保 K2 计算准确
        if (k15.t !== current15mStart) {
          failed.push({ symbol, reason: `15mK线延迟 (${new Date(k15.t).toLocaleTimeString()} != ${new Date(current15mStart).toLocaleTimeString()})` });
          continue;
        }

        // 1. 过滤判断逻辑：使用扫描时刻的最新数据 (k15)
        const k5Close = parseFloat(k5.c);
        const k5Open = parseFloat(k5.o);
        const k5Change = ((k5Close - k5Open) / k5Open) * 100;

        const closePriceCurrent = parseFloat(k15.c);
        const openPriceCurrent = parseFloat(k15.o);
        const k15ChangeCurrent = ((closePriceCurrent - openPriceCurrent) / openPriceCurrent) * 100;
        const kAbsChange = k15ChangeCurrent; // 第二阶段过滤使用的 K2 (最新价 - 本周期开盘价) / 本周期开盘价
        const aChange = ((parseFloat(k15.h) - closePriceCurrent) / closePriceCurrent) * 100;
        const volume = parseFloat(k15.q); // 扫描时刻的成交额

        let kbChange = 0;
        if (this.btcData) {
          kbChange = ((parseFloat(this.btcData.c) - parseFloat(this.btcData.o)) / parseFloat(this.btcData.o)) * 100;
        }

        let match = true;
        let reason = '';
        if (this.settings.scanner.stage2Cond1Enabled && (kAbsChange < this.settings.scanner.stage2K21 || kAbsChange > this.settings.scanner.stage2K22)) {
          match = false;
          reason = `K2(${kAbsChange?.toFixed(2)}%)不在范围`;
        } else if (this.settings.scanner.stage2Cond2Enabled && (aChange < this.settings.scanner.stage2A21 || aChange > this.settings.scanner.stage2A22)) {
          match = false;
          reason = `A(${aChange?.toFixed(2)}%)不在范围`;
        } else if (this.settings.scanner.stage2Cond3Enabled && (volume < this.settings.scanner.stage2M21 || volume > this.settings.scanner.stage2M22)) {
          match = false;
          reason = `交易额(${volume?.toFixed(0)})不在范围`;
        } else if (this.settings.scanner.stage2Cond4Enabled && (k5Change < this.settings.scanner.stage2K51 || k5Change > this.settings.scanner.stage2K52)) {
          match = false;
          reason = `K5(${k5Change?.toFixed(2)}%)不在范围`;
        } else if (this.settings.scanner.stage2Cond5Enabled && this.btcData) {
          if (kbChange < this.settings.scanner.stage2KB1 || kbChange > this.settings.scanner.stage2KB2) {
            match = false;
            reason = `KB(${kbChange?.toFixed(2)}%)不在范围`;
          }
        }

        // 2. 详情显示与止盈止损逻辑：
        // k优开：使用当前 15m K线开盘价 (例如 12:15 开盘价)
        // k优收：使用上一根已完结 15m K线收盘价作为参考 (例如 12:15 收盘价)
        // 注意：下单后的理论价格会根据 12:30:01 获取到的最终收盘价重新更新
        const openPrice = openPriceCurrent;
        const closePriceRef = k15Closed ? parseFloat(k15Closed.c) : openPrice;
        const k15ChangeRef = k15Closed ? ((parseFloat(k15Closed.c) - parseFloat(k15Closed.o)) / parseFloat(k15Closed.o)) * 100 : 0;

        // Check cooldown
        const lastTrade = this.cooldowns.get(symbol) || 0;
        if (Date.now() - lastTrade < this.settings.scanner.stage2Cooldown * 60000) {
          failed.push({ symbol, reason: '冷却中', k2: kAbsChange, a: aChange, volume, k5: k5Change, k15Change: k15ChangeRef, kb: kbChange });
          continue;
        }

        // 初始理论偏移使用参考值
        const k15AbsRef = Math.abs(k15ChangeRef);
        const tpOffset = (k15AbsRef * this.settings.order.takeProfitRatio) / 100;
        const slOffset = (k15AbsRef * this.settings.order.stopLossRatio) / 100;

        const coinData = { 
          symbol, 
          volume, 
          price: closePriceRef, // k有收：显示上一根完结价作为参考
          open: openPrice,      // k有开：当前周期开盘价
          close: closePriceRef,
          high: parseFloat(k15.h),
          low: parseFloat(k15.l),
          k5Change,
          k15Change: k15ChangeRef, 
          aChange,
          kAbsChange, // 过滤用的 K2 (实时最新价计算)
          kbChange,
          tpPrice: this.formatPrice(symbol, closePriceRef * (1 + tpOffset)),
          slPrice: this.formatPrice(symbol, closePriceRef * (1 - slOffset)),
        };

        if (match) {
          candidates.push(coinData);
        } else {
          failed.push({ ...coinData, reason });
        }
      }

      // Sort: volume high to low, then symbol for stability
      candidates.sort((a, b) => {
        if (b.volume !== a.volume) return b.volume - a.volume;
        return a.symbol.localeCompare(b.symbol);
      });
      
      this.stage2Results = candidates;
      this.stage2Failed = failed;
      const duration = Date.now() - startTime;
      this.scanTimes.stage2Duration = duration;

      if (candidates.length > 0) {
        const newBest = candidates[0];
        // 如果新选出的币对和当前优选币对一致，保留已有的“最终”数据（kClosed* 等），防止被扫描的参考值覆盖
        if (this.bestSymbol && this.bestSymbol.symbol === newBest.symbol) {
          newBest.kClosedOpen = this.bestSymbol.kClosedOpen;
          newBest.kClosedClose = this.bestSymbol.kClosedClose;
          newBest.kClosedChange = this.bestSymbol.kClosedChange;
          newBest.tpPrice = this.bestSymbol.tpPrice || newBest.tpPrice;
          newBest.isProcessed = this.bestSymbol.isProcessed;
          newBest.processStatus = this.bestSymbol.processStatus;
        }
        this.bestSymbol = newBest;
        this.scanTimes.bestSelectionTime = Date.now();
        StorageService.addLog({ 
          module: 'Scanner', 
          type: 'scanner', 
          message: `第二阶段扫描完成。耗时: ${duration}ms, 总扫描币对: ${this.stage1Results.length}个, 符合条件币对: ${candidates.length}个, 优选币对: ${this.bestSymbol.symbol}` 
        });
      } else {
        StorageService.addLog({ 
          module: 'Scanner', 
          type: 'scanner', 
          message: `第二阶段扫描完成。耗时: ${duration}ms, 总扫描币对: ${this.stage1Results.length}个, 未发现符合条件的币对` 
        });
      }
    } catch (e: any) {
      StorageService.addLog({ module: 'Scanner', type: 'error', message: `第二阶段扫描失败: ${e.message}` });
    } finally {
      this.isScanning.stage2 = false;
      this.isScanning.stage2Progress = 100;
      this.notifyUI();
    }
  }

  private async placeSecondaryOrders(pending: any) {
    try {
      const { symbol, entryPrice, quantity, targetOpenTime } = pending;
      const serverTime = Date.now() + this.binance.getTimeOffset();
      
      StorageService.addLog({ 
        module: 'Order', 
        type: 'order', 
        message: `进入k优收获取窗口，正在获取 ${symbol} 的已完结 K线 (起始时间: ${new Date(targetOpenTime).toLocaleTimeString('zh-CN', { hour12: false })})` 
      });

      const klines = await this.binance.getKLines(symbol, this.settings.order.kClosedPeriod as any, 5);
      if (!klines || klines.length === 0) {
        throw new Error('无法获取K线数据');
      }

      const closedK = klines.find((k: any) => k[0] === targetOpenTime);
      let finalK;
      if (!closedK) {
        // Fallback to klines[length-2] if exact match not found, but log a warning
        const fallbackK = klines.length >= 2 ? klines[klines.length - 2] : klines[0];
        StorageService.addLog({ 
          module: 'Order', 
          type: 'error', 
          message: `未找到精确匹配的K线 (目标: ${targetOpenTime}), 使用回退数据 (起始: ${fallbackK[0]})` 
        });
        finalK = fallbackK;
      } else {
        finalK = closedK;
      }

      const kOpen = parseFloat(finalK[1]);
      const kClose = parseFloat(finalK[4]);
      const k15Change = ((kClose - kOpen) / kOpen) * 100;

      StorageService.addLog({ 
        module: 'Order', 
        type: 'order', 
        message: `获取成功: k优开=${kOpen}, k优收=${kClose}, k15涨跌幅=${k15Change.toFixed(4)}%` 
      });

      // Calculate TP/SL based on the CLOSED kline data (kClose)
      // Theoretical TP/SL should be based on the K-line Close price, not the actual entry price
      const k15Abs = Math.abs(k15Change);
      const tpOffset = (k15Abs * this.settings.order.takeProfitRatio) / 100;
      const slOffset = (k15Abs * this.settings.order.stopLossRatio) / 100;
      const tpPrice = kClose * (1 + tpOffset);
      const slPrice = kClose * (1 - slOffset);
      const formattedTpPrice = this.formatPrice(symbol, tpPrice);
      const formattedSlPrice = this.formatPrice(symbol, slPrice);

      // 1. Reverse Order (TP)
      StorageService.addLog({ module: 'Order', type: 'order', message: `下“反向单”指令: ${symbol}, 价格: ${formattedTpPrice}` });
      await this.binance.createOrder({
        symbol,
        side: 'SELL',
        type: 'LIMIT',
        quantity: quantity,
        price: formattedTpPrice,
        timeInForce: 'GTC',
        reduceOnly: 'true'
      });

      // 2. Algo Stop Loss Order
      StorageService.addLog({ module: 'Order', type: 'order', message: `下“Algo止损单”指令: ${symbol}, 价格: ${formattedSlPrice}` });
      await this.binance.createAlgoOrder({
        symbol,
        side: 'SELL',
        algoType: 'CONDITIONAL',
        type: 'STOP_MARKET',
        stopPrice: formattedSlPrice,
        triggerPrice: formattedSlPrice,
        quantity: quantity,
        reduceOnly: 'true'
      });

      if (this.activePosition && this.activePosition.symbol === symbol) {
        // No slPrice tagging
      }

      if (this.bestSymbol && this.bestSymbol.symbol === symbol) {
        this.bestSymbol.kClosedOpen = kOpen;
        this.bestSymbol.kClosedClose = kClose;
        this.bestSymbol.kClosedChange = k15Change;
        this.bestSymbol.tpPrice = formattedTpPrice;
        this.bestSymbol.slPrice = formattedSlPrice;
      }

      this.notifyUI();
      StorageService.addLog({ module: 'Order', type: 'order', message: `反向单完成: ${symbol}` });
      this.refreshAccountInfo();
      this.saveState();
    } catch (e: any) {
      StorageService.addLog({ module: 'Order', type: 'error', message: `放置二次订单失败: ${e.message}` });
    }
  }

  private async executeTrade(best: any) {
    if (this.activePosition) return;

    try {
      const symbol = best.symbol;
      const price = best.price;
      
      // Calculate position size
      const balance = parseFloat(this.accountInfo?.totalWalletBalance || '0');
      const kje = Math.min(balance * this.settings.order.leverage * this.settings.order.positionRatio, this.settings.order.maxPositionAmount);
      const kcl = kje / price;
      const formattedQty = this.formatQuantity(symbol, kcl);

      StorageService.addLog({ module: 'Order', type: 'order', message: `正常单下单指令: ${symbol}, 价格: ${price}, 数量: ${formattedQty}` });
      
      await this.binance.setLeverage(symbol, this.settings.order.leverage);
      const order = await this.binance.createOrder({
        symbol,
        side: 'BUY',
        type: 'MARKET',
        quantity: formattedQty,
      });

      // Get actual entry price from order response
      let entryPrice = price;
      if (order && order.avgPrice && parseFloat(order.avgPrice) > 0) {
        entryPrice = parseFloat(order.avgPrice);
      } else if (order && order.fills && order.fills.length > 0) {
        const totalCost = order.fills.reduce((sum: number, fill: any) => sum + (parseFloat(fill.price) * parseFloat(fill.qty)), 0);
        const totalQty = order.fills.reduce((sum: number, fill: any) => sum + parseFloat(fill.qty), 0);
        if (totalQty > 0) entryPrice = totalCost / totalQty;
      }

      // Update local state immediately
      const entryTime = order.updateTime || order.transactTime || Date.now();
      this.activePosition = {
        symbol,
        side: 'BUY',
        amount: parseFloat(formattedQty),
        leverage: this.settings.order.leverage,
        entryPrice: entryPrice,
        markPrice: entryPrice,
        unrealizedProfit: 0,
        updateTime: Date.now(),
        entryTime: entryTime
      };
      
      // Set pending secondary orders to be placed in the next kClosed window
      const periodSec = this.parsePeriod(this.settings.order.kClosedPeriod);
      const serverSeconds = (Date.now() + this.binance.getTimeOffset()) / 1000;
      // 使用当前时间向前偏移 180s (3分钟) 来锁定基准 K 线起始点
      // 21:29:59 -> 21:26:59 -> 21:15
      // 21:30:01 -> 21:27:01 -> 21:15
      // 21:33:01 -> 21:30:01 -> 21:30
      const targetOpenTimeSec = Math.floor((serverSeconds - 180) / periodSec) * periodSec;

      this.pendingSecondaryOrders = {
        symbol,
        entryPrice,
        quantity: formattedQty,
        targetOpenTime: targetOpenTimeSec * 1000,
        triggerTime: (targetOpenTimeSec + periodSec) * 1000 + 200, // K线结束后的 0.2s 触发，极其及时
        kClosedPeriod: this.settings.order.kClosedPeriod
      };

      this.notifyUI();
      this.updateSubscriptions();
      this.cooldowns.set(symbol, Date.now());
      this.saveState();
    } catch (e: any) {
      StorageService.addLog({ module: 'Order', type: 'error', message: `下单失败: ${e.message}` });
    }
  }

  private saveState() {
    StorageService.saveState({
      stage0Results: this.stage0Results,
      stage0PResults: this.stage0PResults,
      stage1Results: this.stage1Results,
      cooldowns: Object.fromEntries(this.cooldowns),
      activePosition: this.activePosition,
      consecutiveReverseOrders: this.consecutiveReverseOrders
    });
  }

  private async sendEmailNotification(reason: string) {
    try {
      const { EmailService } = await import('./email');
      await EmailService.sendNotification(this.settings);
      StorageService.addLog({ 
        module: 'System', 
        type: 'system', 
        message: `已发送邮件通知: ${reason}` 
      });
    } catch (e: any) {
      StorageService.addLog({ 
        module: 'System', 
        type: 'error', 
        message: `邮件通知发送失败: ${e.message}` 
      });
    }
  }

  private notifyUI() {
    if (this.isStopped) return;
    this.onUpdate({
      stage0Results: this.stage0Results,
      stage0PResults: this.stage0PResults,
      stage0PReasons: Object.fromEntries(this.stage0PReasons),
      stage1Results: this.stage1Results,
      stage2Results: this.stage2Results,
      stage2Failed: this.stage2Failed,
      activePosition: this.activePosition,
      activeOrders: this.activeOrders,
      accountInfo: this.accountInfo,
      btcData: this.btcData,
      wsStatus: this.ws.status,
      wsError: this.wsError,
      lastWSMessageTime: this.lastWSMessageTime,
      apiError: this.apiError,
      ip: this.ip,
      scanTimes: this.scanTimes,
      bestSymbol: this.bestSymbol,
      isScanning: this.isScanning
    });
  }

  async updateSettings(settings: AppSettings) {
    this.settings = settings;
    this.masterSwitch = settings.masterSwitch;
    
    // Re-init binance if keys changed
    this.binance = new BinanceService(
      settings.binance.apiKey,
      settings.binance.secretKey,
      settings.binance.baseUrl
    );
    this.binance.setIpSelection(settings.ipSelection);

    // Update WebSocket URL if changed
    this.ws.setUrl(settings.binance.wsUrl);

    // Re-sync time and refresh account info with new keys
    if (this.masterSwitch) {
      await this.binance.syncTime();
      await this.refreshAccountInfo();
    }
  }

  setMasterSwitch(val: boolean) {
    this.masterSwitch = val;
    this.settings.masterSwitch = val;
    StorageService.saveSettings(this.settings);
    
    if (val) {
      // ON: Re-initialize everything
      this.binance.syncTime();
      this.refreshExchangeInfo();
      this.setupUserDataStream();
      this.ws.connect(
        () => {
          this.wsError = null;
          this.notifyUI();
          this.updateSubscriptions();
        },
        () => this.notifyUI(),
        (err) => {
          this.wsError = 'WebSocket 连接失败，请检查地址或网络';
          this.notifyUI();
        }
      );
      this.refreshAccountInfo();
      // 立即执行第一次全市场扫描
      this.runStage0();
    } else {
      // OFF: Cleanup and stop all requests
      this.updateSubscriptions(); // Will clear all market data subscriptions
      this.ws.close();
      if (this.listenKeyTimer) clearInterval(this.listenKeyTimer);
      this.listenKeyTimer = null;
      this.listenKey = null;
      this.notifyUI();
    }
  }

  public forceRunStage0() {
    this.runStage0();
  }

  public forceRunStage0P() {
    this.runStage0P();
  }

  public forceRunStage1() {
    this.runStage1();
  }

  public forceRunStage2() {
    this.runStage2();
  }
}
