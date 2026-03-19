import React, { useState, useEffect, useRef } from 'react';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { ScannerView } from './components/ScannerView';
import { LogView } from './components/LogView';
import { SettingsView } from './components/SettingsView';
import { LockScreen } from './components/LockScreen';
import { StorageService } from './services/storage';
import { StrategyEngine } from './services/strategy';
import { BinanceService } from './services/binance';
import { SupabaseService } from './services/supabase';
import { AppSettings, LogEntry } from './types';

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(() => {
    const s = StorageService.getSettings();
    return s;
  });
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isLocked, setIsLocked] = useState(true);
  const [logs, setLogs] = useState<LogEntry[]>(StorageService.getLogs());
  const [ip, setIp] = useState('加载中...');
  const [localIp, setLocalIp] = useState('加载中...');
  const [engineState, setEngineState] = useState<any>({
    stage0Results: [],
    stage0PResults: [],
    stage0PReasons: {},
    stage1Results: [],
    stage2Results: [],
    activePosition: null,
    activeOrders: [],
    accountInfo: null,
    btcData: null,
    wsStatus: 'CLOSED',
    masterSwitch: settings.masterSwitch,
    scanTimes: {
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
    }
  });

  const engineRef = useRef<StrategyEngine | null>(null);
  const lockTimerRef = useRef<any>(null);

  // Auto-pull from Supabase on mount
  useEffect(() => {
    const pullRemoteSettings = async () => {
      try {
        const remoteSettings = await SupabaseService.pullSettings(settings);
        if (remoteSettings) {
          // 1. 同步配置
          setSettings(remoteSettings);
          StorageService.saveSettings(remoteSettings);
          if (engineRef.current) {
            engineRef.current.updateSettings(remoteSettings);
          }
          
          // 2. 记录日志
          StorageService.addLog({ 
            module: 'System', 
            type: 'system', 
            message: '已从sup同步回' 
          });
          setLogs(StorageService.getLogs());

          // 3. 开启启动开关
          handleToggleMaster(true);
        } else {
          // 如果拉取失败，仍然开启本地开关（保持原有逻辑兜底）
          handleToggleMaster(true);
        }
      } catch (e) {
        console.error('Failed to auto-pull settings from Supabase:', e);
        handleToggleMaster(true);
      }
    };
    pullRemoteSettings();
  }, []);

  // Initialize Strategy Engine
  useEffect(() => {
    const engine = new StrategyEngine(settings, (state) => {
      setEngineState((prev: any) => ({ ...prev, ...state }));
      if (state.ip) setIp(state.ip);
      // Sync logs when they change (StorageService adds them, but we need to update UI)
      setLogs(StorageService.getLogs());
    });
    
    engineRef.current = engine;
    engine.start();

    // Fetch IPs
    const binance = new BinanceService(
      settings.binance.apiKey, 
      settings.binance.secretKey, 
      settings.binance.baseUrl
    );
    
    const fetchIps = () => {
      binance.getIp().then(setIp);
      
      fetch('https://api.ipify.org?format=json')
        .then(res => res.json())
        .then(data => setLocalIp(data.ip))
        .catch(() => setLocalIp('获取失败'));
    };

    fetchIps();
    const ipInterval = setInterval(fetchIps, 30000);

    return () => {
      clearInterval(ipInterval);
      if (engineRef.current) {
        engineRef.current.stop();
      }
    };
  }, []);

  // Handle Lock Timeout
  useEffect(() => {
    const resetLockTimer = () => {
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
      lockTimerRef.current = setTimeout(() => {
        setIsLocked(true);
      }, settings.lockTimeout * 60000);
    };

    if (!isLocked) {
      resetLockTimer();
      window.addEventListener('mousemove', resetLockTimer);
      window.addEventListener('keydown', resetLockTimer);
    }

    return () => {
      window.removeEventListener('mousemove', resetLockTimer);
      window.removeEventListener('keydown', resetLockTimer);
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    };
  }, [isLocked, settings.lockTimeout]);

  const handleSaveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    StorageService.saveSettings(newSettings);
    if (engineRef.current) {
      engineRef.current.updateSettings(newSettings);
    }
    setLogs(StorageService.getLogs());
  };

  const handleToggleMaster = (val: boolean) => {
    if (engineRef.current) {
      engineRef.current.setMasterSwitch(val);
      setEngineState((prev: any) => ({ ...prev, masterSwitch: val }));
      StorageService.addLog({ 
        module: 'System', 
        type: 'system', 
        message: `策略总开关已${val ? '开启' : '关闭'}` 
      });
      setLogs(StorageService.getLogs());
    }
  };

  const handleClearLogs = () => {
    StorageService.clearLogs();
    setLogs([]);
  };

  if (isLocked) {
    return <LockScreen correctPassword={settings.lockPassword} onUnlock={() => setIsLocked(false)} />;
  }

  return (
    <Layout 
      activeTab={activeTab} 
      setActiveTab={setActiveTab}
      masterSwitch={engineState.masterSwitch}
      onToggleMaster={handleToggleMaster}
      onLock={() => setIsLocked(true)}
    >
      {activeTab === 'dashboard' && <Dashboard state={engineState} ip={ip} localIp={localIp} />}
      {activeTab === 'scanner' && (
        <ScannerView 
          state={engineState} 
          onForceStage0={() => engineRef.current?.forceRunStage0()}
          onForceStage0P={() => engineRef.current?.forceRunStage0P()}
          onForceStage1={() => engineRef.current?.forceRunStage1()}
          onForceStage2={() => engineRef.current?.forceRunStage2()}
        />
      )}
      {activeTab === 'logs' && <LogView logs={logs} onClear={handleClearLogs} />}
      {activeTab === 'settings' && <SettingsView settings={settings} onSave={handleSaveSettings} ip={ip} />}
    </Layout>
  );
}
