import { AppSettings, LogEntry } from "../types";
import { DEFAULT_SETTINGS } from "../constants";

const STORAGE_KEY = "super_strong_settings";
const LOGS_KEY = "super_strong_logs";
const STATE_KEY = "super_strong_state";

export const StorageService = {
  getSettings(): AppSettings {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return DEFAULT_SETTINGS;
    try {
      const parsed = JSON.parse(saved);
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        binance: { ...DEFAULT_SETTINGS.binance, ...(parsed.binance || {}) },
        supabase: { ...DEFAULT_SETTINGS.supabase, ...(parsed.supabase || {}) },
        scanner: { ...DEFAULT_SETTINGS.scanner, ...(parsed.scanner || {}) },
        order: { ...DEFAULT_SETTINGS.order, ...(parsed.order || {}) },
        email: { ...DEFAULT_SETTINGS.email, ...(parsed.email || {}) },
      };
    } catch (e) {
      return DEFAULT_SETTINGS;
    }
  },

  saveSettings(settings: AppSettings) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  },

  getLogs(): LogEntry[] {
    const saved = localStorage.getItem(LOGS_KEY);
    if (!saved) return [];
    try {
      return JSON.parse(saved);
    } catch (e) {
      return [];
    }
  },

  addLog(entry: Omit<LogEntry, 'id' | 'timestamp'>) {
    const logs = this.getLogs();
    const newLog: LogEntry = {
      ...entry,
      id: Math.random().toString(36).substring(2, 15),
      timestamp: Date.now(),
    };
    logs.unshift(newLog);
    // Keep last 1000 logs
    localStorage.setItem(LOGS_KEY, JSON.stringify(logs.slice(0, 1000)));
    return newLog;
  },

  clearLogs() {
    localStorage.removeItem(LOGS_KEY);
  },

  saveState(state: any) {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  },

  getState() {
    const saved = localStorage.getItem(STATE_KEY);
    return saved ? JSON.parse(saved) : null;
  }
};
