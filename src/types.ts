export interface BinanceConfig {
  apiKey: string;
  secretKey: string;
  baseUrl: string;
  wsUrl: string;
}

export interface SupabaseConfig {
  projectUrl: string;
  publishableKey: string;
  connectionString: string;
  supaName: string;
}

export interface ScannerParams {
  // Stage 0
  stage0Period: string; // e.g. "1h"
  stage0StartTime: string; // e.g. "00:35"
  stage0KLineInterval: string; // e.g. "15m"
  stage0KCountMin: number;
  stage0KCountMax: number;
  stage0CustomMinutes: number; // Default 15m

  // Stage 0P (New)
  stage0PEnabled: boolean;
  stage0PPeriod: string;
  stage0PStartTime: string;
  stage0P15mEnabled: boolean;
  stage0P15mCount: number;
  stage0P15mRef: number;
  stage0P1hEnabled: boolean;
  stage0P1hCount: number;
  stage0P1hRef: number;
  stage0P4hEnabled: boolean;
  stage0P4hCount: number;
  stage0P4hRef: number;
  stage0PDayEnabled: boolean;
  stage0PDayCount: number;
  stage0PDayRef: number;
  stage0PParam1Enabled: boolean;
  stage0PParam1Ref: number;
  stage0PParam2Enabled: boolean;
  stage0PParam2Ref: number;
  stage0PParam3Enabled: boolean;
  stage0PParam3Ref: number;

  // Stage 1
  stage1Period: string; // e.g. "15m"
  stage1StartTime: string; // e.g. "00:14:30.000"
  stage1MinVolume: number;
  stage1KLineMin: number;
  stage1KLineMax: number;
  whitelist: string;
  blacklist: string;

  // Stage 2
  stage2K21: number;
  stage2K22: number;
  stage2A21: number;
  stage2A22: number;
  stage2M21: number;
  stage2M22: number;
  stage2K51: number;
  stage2K52: number;
  stage2KB1: number;
  stage2KB2: number;
  stage2Period: string;
  stage2StartTime: string; // e.g. "00:14:57.000"
  stage2Cooldown: number;
  
  // Toggles
  stage1Cond1Enabled: boolean;
  stage1Cond2Enabled: boolean;
  stage2Cond1Enabled: boolean;
  stage2Cond2Enabled: boolean;
  stage2Cond3Enabled: boolean;
  stage2Cond4Enabled: boolean;
  stage2Cond5Enabled: boolean;
}

export interface OrderParams {
  leverage: number;
  positionRatio: number;
  maxPositionAmount: number;
  takeProfitRatio: number;
  stopLossRatio: number;
  forwardOrderWindow: number; // Default 5s
  maxHoldTime: number;
  period: string;
  startTime: string; // Default 00:14:59.500
  kClosedPeriod: string; // Default 15m
  kClosedWindowStart: number; // Default 1s
  kClosedWindowEnd: number; // Default 4s
}

export interface AppSettings {
  binance: BinanceConfig;
  supabase: SupabaseConfig;
  scanner: ScannerParams;
  order: OrderParams;
  lockPassword: string;
  lockTimeout: number; // minutes
  masterSwitch: boolean;
  ipSelection: 'local' | 'proxy';
  email: {
    enabled: boolean;
    from: string;
    to: string;
    smtp: string;
    port: number;
    pass: string;
    balanceLimitEnabled: boolean;
    balanceLimit: number;
    reverseOrderLimitEnabled: boolean;
    reverseOrderLimit: number;
  };
}

export interface LogEntry {
  id: string;
  timestamp: number;
  type: 'scanner' | 'order' | 'system' | 'error';
  module: string;
  message: string;
  details?: any;
}

export interface MarketData {
  symbol: string;
  price: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  close: number;
  kLineCount?: number;
}

export interface Position {
  symbol: string;
  side: 'BUY' | 'SELL';
  amount: number;
  leverage: number;
  entryPrice: number;
  markPrice: number;
  unrealizedProfit: number;
  updateTime: number;
  entryTime: number;
}

export interface Order {
  symbol: string;
  orderId: string;
  side: 'BUY' | 'SELL';
  type: string;
  amount: number;
  price: number;
  time: number;
  leverage?: number;
}
