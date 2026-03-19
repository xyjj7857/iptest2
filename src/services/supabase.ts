import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppSettings } from '../types';

export class SupabaseService {
  private static client: SupabaseClient | null = null;
  private static lastUrl: string = '';
  private static lastKey: string = '';

  private static getClient(url: string, key: string) {
    if (!url || !key) return null;
    
    // If URL or Key changed, or client not initialized, create new one
    if (!this.client || this.lastUrl !== url || this.lastKey !== key) {
      this.client = createClient(url, key, {
        auth: {
          persistSession: false, // Disable auth persistence to avoid multiple instance warnings
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      });
      this.lastUrl = url;
      this.lastKey = key;
    }
    
    return this.client;
  }

  static async pushSettings(settings: AppSettings): Promise<void> {
    const { projectUrl, publishableKey, supaName } = settings.supabase;
    const client = this.getClient(projectUrl, publishableKey);
    if (!client) throw new Error('Supabase configuration missing');

    const row = this.settingsToRow(settings);
    
    // Use upsert to ensure row with id=1 exists
    const { error } = await client
      .from(supaName)
      .upsert({ id: 1, ...row });

    if (error) throw error;
  }

  static async pullSettings(settings: AppSettings): Promise<AppSettings | null> {
    const { projectUrl, publishableKey, supaName } = settings.supabase;
    const client = this.getClient(projectUrl, publishableKey);
    if (!client) return null;

    const { data, error } = await client
      .from(supaName)
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error) {
      console.error(`Supabase Pull Error (${supaName}):`, error.message);
      return null;
    }
    
    if (!data) {
      console.warn(`Supabase Pull: No data found for id=1 in table ${supaName}`);
      return null;
    }

    return this.rowToSettings(data, settings);
  }

  private static settingsToRow(s: AppSettings) {
    return {
      master_switch: s.masterSwitch,
      binance_api_key: s.binance.apiKey,
      binance_secret_key: s.binance.secretKey,
      binance_base_url: s.binance.baseUrl,
      binance_ws_url: s.binance.wsUrl,
      ip_selection: s.ipSelection,
      
      s0_period: s.scanner.stage0Period,
      s0_start_time: s.scanner.stage0StartTime,
      s0_kline_interval: s.scanner.stage0KLineInterval,
      s0_kcount_min: s.scanner.stage0KCountMin,
      s0_kcount_max: s.scanner.stage0KCountMax,
      s0_custom_minutes: s.scanner.stage0CustomMinutes,
      
      s0p_enabled: s.scanner.stage0PEnabled,
      s0p_period: s.scanner.stage0PPeriod,
      s0p_start_time: s.scanner.stage0PStartTime,
      s0p_15m_enabled: s.scanner.stage0P15mEnabled,
      s0p_15m_count: s.scanner.stage0P15mCount,
      s0p_15m_ref: s.scanner.stage0P15mRef,
      s0p_1h_enabled: s.scanner.stage0P1hEnabled,
      s0p_1h_count: s.scanner.stage0P1hCount,
      s0p_1h_ref: s.scanner.stage0P1hRef,
      s0p_4h_enabled: s.scanner.stage0P4hEnabled,
      s0p_4h_count: s.scanner.stage0P4hCount,
      s0p_4h_ref: s.scanner.stage0P4hRef,
      s0p_day_enabled: s.scanner.stage0PDayEnabled,
      s0p_day_count: s.scanner.stage0PDayCount,
      s0p_day_ref: s.scanner.stage0PDayRef,
      s0p_param1_enabled: s.scanner.stage0PParam1Enabled,
      s0p_param1_ref: s.scanner.stage0PParam1Ref,
      s0p_param2_enabled: s.scanner.stage0PParam2Enabled,
      s0p_param2_ref: s.scanner.stage0PParam2Ref,
      s0p_param3_enabled: s.scanner.stage0PParam3Enabled,
      s0p_param3_ref: s.scanner.stage0PParam3Ref,
      
      s1_period: s.scanner.stage1Period,
      s1_start_time: s.scanner.stage1StartTime,
      s1_min_volume: s.scanner.stage1MinVolume,
      s1_kline_min: s.scanner.stage1KLineMin,
      s1_kline_max: s.scanner.stage1KLineMax,
      s1_whitelist: s.scanner.whitelist,
      s1_blacklist: s.scanner.blacklist,
      s1_cond1_enabled: s.scanner.stage1Cond1Enabled,
      s1_cond2_enabled: s.scanner.stage1Cond2Enabled,
      
      s2_k21: s.scanner.stage2K21,
      s2_k22: s.scanner.stage2K22,
      s2_a21: s.scanner.stage2A21,
      s2_a22: s.scanner.stage2A22,
      s2_m21: s.scanner.stage2M21,
      s2_m22: s.scanner.stage2M22,
      s2_k51: s.scanner.stage2K51,
      s2_k52: s.scanner.stage2K52,
      s2_kb1: s.scanner.stage2KB1,
      s2_kb2: s.scanner.stage2KB2,
      s2_period: s.scanner.stage2Period,
      s2_start_time: s.scanner.stage2StartTime,
      s2_cooldown: s.scanner.stage2Cooldown,
      s2_cond1_enabled: s.scanner.stage2Cond1Enabled,
      s2_cond2_enabled: s.scanner.stage2Cond2Enabled,
      s2_cond3_enabled: s.scanner.stage2Cond3Enabled,
      s2_cond4_enabled: s.scanner.stage2Cond4Enabled,
      s2_cond5_enabled: s.scanner.stage2Cond5Enabled,
      
      order_leverage: s.order.leverage,
      order_position_ratio: s.order.positionRatio,
      order_max_position: s.order.maxPositionAmount,
      order_tp_ratio: s.order.takeProfitRatio,
      order_sl_ratio: s.order.stopLossRatio,
      order_forward_window: s.order.forwardOrderWindow,
      order_max_hold_time: s.order.maxHoldTime,
      order_period: s.order.period,
      order_start_time: s.order.startTime,
      order_kclosed_period: s.order.kClosedPeriod,
      order_kclosed_start: s.order.kClosedWindowStart,
      order_kclosed_end: s.order.kClosedWindowEnd,
      
      email_enabled: s.email.enabled,
      email_from: s.email.from,
      email_to: s.email.to,
      email_smtp: s.email.smtp,
      email_port: s.email.port,
      email_pass: s.email.pass,
      email_balance_limit_enabled: s.email.balanceLimitEnabled,
      email_balance_limit: s.email.balanceLimit,
      email_reverse_limit_enabled: s.email.reverseOrderLimitEnabled,
      email_reverse_limit: s.email.reverseOrderLimit,
      
      lock_password: s.lockPassword,
      lock_timeout: s.lockTimeout
    };
  }

  private static toNum(val: any, fallback: number): number {
    if (val === null || val === undefined || val === '') return fallback;
    const n = Number(val);
    return isNaN(n) ? fallback : n;
  }

  private static rowToSettings(row: any, current: AppSettings): AppSettings {
    return {
      ...current,
      masterSwitch: row.master_switch ?? current.masterSwitch,
      ipSelection: (row.ip_selection as any) ?? current.ipSelection,
      lockPassword: row.lock_password ?? current.lockPassword,
      lockTimeout: this.toNum(row.lock_timeout, current.lockTimeout),
      binance: {
        ...current.binance,
        apiKey: row.binance_api_key ?? current.binance.apiKey,
        secretKey: row.binance_secret_key ?? current.binance.secretKey,
        baseUrl: row.binance_base_url ?? current.binance.baseUrl,
        wsUrl: row.binance_ws_url ?? current.binance.wsUrl,
      },
      scanner: {
        ...current.scanner,
        stage0Period: row.s0_period ?? current.scanner.stage0Period,
        stage0StartTime: row.s0_start_time ?? current.scanner.stage0StartTime,
        stage0KLineInterval: row.s0_kline_interval ?? current.scanner.stage0KLineInterval,
        stage0KCountMin: this.toNum(row.s0_kcount_min, current.scanner.stage0KCountMin),
        stage0KCountMax: this.toNum(row.s0_kcount_max, current.scanner.stage0KCountMax),
        stage0CustomMinutes: this.toNum(row.s0_custom_minutes, current.scanner.stage0CustomMinutes),
        
        stage0PEnabled: row.s0p_enabled ?? current.scanner.stage0PEnabled,
        stage0PPeriod: row.s0p_period ?? current.scanner.stage0PPeriod,
        stage0PStartTime: row.s0p_start_time ?? current.scanner.stage0PStartTime,
        stage0P15mEnabled: row.s0p_15m_enabled ?? current.scanner.stage0P15mEnabled,
        stage0P15mCount: this.toNum(row.s0p_15m_count, current.scanner.stage0P15mCount),
        stage0P15mRef: this.toNum(row.s0p_15m_ref, current.scanner.stage0P15mRef),
        stage0P1hEnabled: row.s0p_1h_enabled ?? current.scanner.stage0P1hEnabled,
        stage0P1hCount: this.toNum(row.s0p_1h_count, current.scanner.stage0P1hCount),
        stage0P1hRef: this.toNum(row.s0p_1h_ref, current.scanner.stage0P1hRef),
        stage0P4hEnabled: row.s0p_4h_enabled ?? current.scanner.stage0P4hEnabled,
        stage0P4hCount: this.toNum(row.s0p_4h_count, current.scanner.stage0P4hCount),
        stage0P4hRef: this.toNum(row.s0p_4h_ref, current.scanner.stage0P4hRef),
        stage0PDayEnabled: row.s0p_day_enabled ?? current.scanner.stage0PDayEnabled,
        stage0PDayCount: this.toNum(row.s0p_day_count, current.scanner.stage0PDayCount),
        stage0PDayRef: this.toNum(row.s0p_day_ref, current.scanner.stage0PDayRef),
        stage0PParam1Enabled: row.s0p_param1_enabled ?? current.scanner.stage0PParam1Enabled,
        stage0PParam1Ref: this.toNum(row.s0p_param1_ref, current.scanner.stage0PParam1Ref),
        stage0PParam2Enabled: row.s0p_param2_enabled ?? current.scanner.stage0PParam2Enabled,
        stage0PParam2Ref: this.toNum(row.s0p_param2_ref, current.scanner.stage0PParam2Ref),
        stage0PParam3Enabled: row.s0p_param3_enabled ?? current.scanner.stage0PParam3Enabled,
        stage0PParam3Ref: this.toNum(row.s0p_param3_ref, current.scanner.stage0PParam3Ref),
        
        stage1Period: row.s1_period ?? current.scanner.stage1Period,
        stage1StartTime: row.s1_start_time ?? current.scanner.stage1StartTime,
        stage1MinVolume: this.toNum(row.s1_min_volume, current.scanner.stage1MinVolume),
        stage1KLineMin: this.toNum(row.s1_kline_min, current.scanner.stage1KLineMin),
        stage1KLineMax: this.toNum(row.s1_kline_max, current.scanner.stage1KLineMax),
        whitelist: row.s1_whitelist ?? current.scanner.whitelist,
        blacklist: row.s1_blacklist ?? current.scanner.blacklist,
        stage1Cond1Enabled: row.s1_cond1_enabled ?? current.scanner.stage1Cond1Enabled,
        stage1Cond2Enabled: row.s1_cond2_enabled ?? current.scanner.stage1Cond2Enabled,
        stage2K21: this.toNum(row.s2_k21, current.scanner.stage2K21),
        stage2K22: this.toNum(row.s2_k22, current.scanner.stage2K22),
        stage2A21: this.toNum(row.s2_a21, current.scanner.stage2A21),
        stage2A22: this.toNum(row.s2_a22, current.scanner.stage2A22),
        stage2M21: this.toNum(row.s2_m21, current.scanner.stage2M21),
        stage2M22: this.toNum(row.s2_m22, current.scanner.stage2M22),
        stage2K51: this.toNum(row.s2_k51, current.scanner.stage2K51),
        stage2K52: this.toNum(row.s2_k52, current.scanner.stage2K52),
        stage2KB1: this.toNum(row.s2_kb1, current.scanner.stage2KB1),
        stage2KB2: this.toNum(row.s2_kb2, current.scanner.stage2KB2),
        stage2Period: row.s2_period ?? current.scanner.stage2Period,
        stage2StartTime: row.s2_start_time ?? current.scanner.stage2StartTime,
        stage2Cooldown: this.toNum(row.s2_cooldown, current.scanner.stage2Cooldown),
        stage2Cond1Enabled: row.s2_cond1_enabled ?? current.scanner.stage2Cond1Enabled,
        stage2Cond2Enabled: row.s2_cond2_enabled ?? current.scanner.stage2Cond2Enabled,
        stage2Cond3Enabled: row.s2_cond3_enabled ?? current.scanner.stage2Cond3Enabled,
        stage2Cond4Enabled: row.s2_cond4_enabled ?? current.scanner.stage2Cond4Enabled,
        stage2Cond5Enabled: row.s2_cond5_enabled ?? current.scanner.stage2Cond5Enabled,
      },
      order: {
        ...current.order,
        leverage: this.toNum(row.order_leverage, current.order.leverage),
        positionRatio: this.toNum(row.order_position_ratio, current.order.positionRatio),
        maxPositionAmount: this.toNum(row.order_max_position, current.order.maxPositionAmount),
        takeProfitRatio: this.toNum(row.order_tp_ratio, current.order.takeProfitRatio),
        stopLossRatio: this.toNum(row.order_sl_ratio, current.order.stopLossRatio),
        forwardOrderWindow: this.toNum(row.order_forward_window, current.order.forwardOrderWindow),
        maxHoldTime: this.toNum(row.order_max_hold_time, current.order.maxHoldTime),
        period: row.order_period ?? current.order.period,
        startTime: row.order_start_time ?? current.order.startTime,
        kClosedPeriod: row.order_kclosed_period ?? current.order.kClosedPeriod,
        kClosedWindowStart: this.toNum(row.order_kclosed_start, current.order.kClosedWindowStart),
        kClosedWindowEnd: this.toNum(row.order_kclosed_end, current.order.kClosedWindowEnd),
      },
      email: {
        ...current.email,
        enabled: row.email_enabled ?? current.email.enabled,
        from: row.email_from ?? current.email.from,
        to: row.email_to ?? current.email.to,
        smtp: row.email_smtp ?? current.email.smtp,
        port: this.toNum(row.email_port, current.email.port),
        pass: row.email_pass ?? current.email.pass,
        balanceLimitEnabled: row.email_balance_limit_enabled ?? current.email.balanceLimitEnabled,
        balanceLimit: this.toNum(row.email_balance_limit, current.email.balanceLimit),
        reverseOrderLimitEnabled: row.email_reverse_limit_enabled ?? current.email.reverseOrderLimitEnabled,
        reverseOrderLimit: this.toNum(row.email_reverse_limit, current.email.reverseOrderLimit),
      }
    };
  }
}
