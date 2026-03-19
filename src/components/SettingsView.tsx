import React, { useState } from 'react';
import { AppSettings } from '../types';
import { Save, Eye, EyeOff, RotateCcw, CloudDownload, CloudUpload } from 'lucide-react';
import { DEFAULT_SETTINGS } from '../constants';
import { SupabaseService } from '../services/supabase';
import { StorageService } from '../services/storage';

interface SettingsViewProps {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  ip: string;
  onRefreshIp?: (newIp: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ settings, onSave, ip, onRefreshIp }) => {
  const [localSettings, setLocalSettings] = useState(settings);
  const [showSecrets, setShowSecrets] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [displayIp, setDisplayIp] = useState(ip);
  const [isRefreshingIp, setIsRefreshingIp] = useState(false);

  const handleRefreshIp = async () => {
    setIsRefreshingIp(true);
    try {
      const res = await fetch('/api/system/ip?refresh=true');
      const data = await res.json();
      const newIp = data.ip || '获取失败';
      setDisplayIp(newIp);
      if (onRefreshIp) onRefreshIp(newIp);
    } catch (e) {
      alert('刷新 IP 失败');
    } finally {
      setIsRefreshingIp(false);
    }
  };

  // Sync local state when prop changes (e.g. from auto-pull at startup)
  React.useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  // Sync displayIp when prop changes
  React.useEffect(() => {
    setDisplayIp(ip);
  }, [ip]);

  const handleChange = (module: keyof AppSettings, field: string, value: any) => {
    setLocalSettings(prev => ({
      ...prev,
      [module]: typeof prev[module] === 'object' 
        ? { ...prev[module] as any, [field]: value }
        : value
    }));
  };

  const handleScannerChange = (field: string, value: any) => {
    setLocalSettings(prev => ({
      ...prev,
      scanner: { ...prev.scanner, [field]: value }
    }));
  };

  const handleOrderChange = (field: string, value: any) => {
    setLocalSettings(prev => ({
      ...prev,
      order: { ...prev.order, [field]: value }
    }));
  };

  const handleReset = () => {
    if (window.confirm('确定要恢复默认设置吗？这将覆盖当前所有配置（API密钥除外）。')) {
      const resetSettings = {
        ...DEFAULT_SETTINGS,
        binance: localSettings.binance, // Keep API keys
        supabase: localSettings.supabase,
      };
      setLocalSettings(resetSettings);
    }
  };

  const handleSave = async () => {
    setIsSyncing(true);
    try {
      // First save locally
      onSave(localSettings);
      
      // Then push to Supabase
      await SupabaseService.pushSettings(localSettings);
      
      // Log success
      StorageService.addLog({
        module: 'System',
        type: 'system',
        message: '已同步到sup'
      });
      
      alert('设置已成功保存并同步到 Supabase！');
    } catch (e: any) {
      alert(`保存成功，但 Supabase 同步失败: ${e.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePull = async () => {
    if (!window.confirm('确定要从 Supabase 拉取配置吗？这将覆盖当前未保存的修改。')) return;
    
    setIsSyncing(true);
    try {
      // Use original saved settings as base, but UI credentials for the pull
      const remoteSettings = await SupabaseService.pullSettings({
        ...settings,
        supabase: localSettings.supabase
      });
      
      if (remoteSettings) {
        // 1. Update local state for immediate UI feedback
        setLocalSettings(remoteSettings);
        
        // 2. Add log
        StorageService.addLog({
          module: 'System',
          type: 'system',
          message: '已从 Supabase 同步回配置'
        });

        // 3. Update global state in App.tsx (this will also save to localStorage and refresh logs)
        onSave(remoteSettings);
        
        alert('已成功从 Supabase 拉取最新配置！');
      } else {
        alert('未能从 Supabase 获取到配置数据，请检查配置或表是否存在。');
      }
    } catch (e: any) {
      alert(`拉取失败: ${e.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm">
        <h2 className="text-xl font-bold text-gray-800">系统设置</h2>
        <div className="flex gap-2">
          <button 
            onClick={handlePull}
            disabled={isSyncing}
            className="flex items-center gap-2 bg-blue-50 text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
          >
            <CloudDownload size={18} /> 从 Supabase 拉取
          </button>
          <button 
            onClick={handleReset}
            disabled={isSyncing}
            className="flex items-center gap-2 bg-gray-100 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            <RotateCcw size={18} /> 恢复默认
          </button>
          <button 
            onClick={handleSave}
            disabled={isSyncing}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {isSyncing ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /> : <Save size={18} />}
            保存并同步
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border-2 border-amber-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-100 text-amber-600 rounded-full">
              <RotateCcw size={24} />
            </div>
            <div>
              <h3 className="font-bold text-gray-800">API 连接测试</h3>
              <p className="text-sm text-gray-500">验证 API 密钥、权限及 IP 白名单设置</p>
            </div>
          </div>
          <button 
            onClick={async () => {
              try {
                const binance = new (await import('../services/binance')).BinanceService(
                  localSettings.binance.apiKey,
                  localSettings.binance.secretKey,
                  localSettings.binance.baseUrl
                );
                await binance.getAccountInfo();
                alert('连接成功！API 密钥及 IP 设置均正常。');
              } catch (e: any) {
                alert(`连接失败: ${e.message}`);
              }
            }}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-indigo-700 transition-all shadow-md active:scale-95"
          >
            立即测试连接
          </button>
        </div>
      </div>

      {/* API Management */}
      <section className="bg-white p-6 rounded-xl shadow-sm space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold border-l-4 border-indigo-500 pl-3">API 管理</h3>
          <button onClick={() => setShowSecrets(!showSecrets)} className="text-gray-500 hover:text-indigo-600">
            {showSecrets ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-sm text-gray-500">Binance API Key</label>
            <input 
              type={showSecrets ? "text" : "password"}
              value={localSettings.binance.apiKey}
              onChange={(e) => handleChange('binance', 'apiKey', e.target.value)}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-500">Binance Secret Key</label>
            <input 
              type={showSecrets ? "text" : "password"}
              value={localSettings.binance.secretKey}
              onChange={(e) => handleChange('binance', 'secretKey', e.target.value)}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-500">Base URL</label>
            <input 
              value={localSettings.binance.baseUrl}
              onChange={(e) => handleChange('binance', 'baseUrl', e.target.value)}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-sm text-gray-500">WS URL</label>
              <button 
                onClick={() => handleChange('binance', 'wsUrl', 'wss://fstream.binance.com/ws')}
                className="text-[10px] text-indigo-600 hover:underline"
              >
                重置默认
              </button>
            </div>
            <input 
              value={localSettings.binance.wsUrl}
              onChange={(e) => handleChange('binance', 'wsUrl', e.target.value)}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
        </div>
        <div className="mt-4 p-4 bg-amber-50 rounded-xl border border-amber-200">
          <div className="flex justify-between items-start gap-4">
            <div className="flex-1">
              <p className="text-xs text-amber-600 font-bold uppercase flex items-center gap-1">
                <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
                服务器 IP (用于币安 API 白名单)
              </p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-xl font-mono font-bold text-amber-800">{displayIp}</p>
                <button 
                  onClick={handleRefreshIp}
                  disabled={isRefreshingIp}
                  className="p-1 text-amber-600 hover:bg-amber-100 rounded-md transition-colors disabled:opacity-50"
                  title="刷新 IP"
                >
                  <RotateCcw size={16} className={isRefreshingIp ? 'animate-spin' : ''} />
                </button>
              </div>
              <div className="mt-3 space-y-2">
                <p className="text-xs text-amber-700 leading-relaxed">
                  核心程序将通过 <span className="font-bold">服务器 IP</span> 执行，您 <span className="font-bold underline">必须</span> 在币安 API 设置中：
                </p>
                <ul className="text-[11px] text-amber-600 list-disc list-inside space-y-1">
                  <li>勾选 <span className="font-bold">“启用合约”</span> 权限</li>
                  <li>选择 <span className="font-bold">“限制只允许受信任 IP 的访问”</span></li>
                  <li>将上方 IP 地址复制并粘贴到币安的 IP 白名单列表中</li>
                </ul>
                <p className="text-[10px] text-amber-500 italic mt-2">
                  提示：使用“代理 IP”模式可以避免因您的本地网络变动导致的 IP 验证失败，建议开启。
                </p>
              </div>
            </div>
            <button 
              onClick={() => {
                navigator.clipboard.writeText(displayIp);
                alert('IP 已复制到剪贴板');
              }}
              className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-bold hover:bg-amber-700 transition-all shadow-sm active:scale-95"
            >
              复制 IP
            </button>
          </div>
        </div>
      </section>

      {/* Supabase Configuration */}
      <section className="bg-white p-6 rounded-xl shadow-sm space-y-4">
        <h3 className="text-lg font-semibold border-l-4 border-emerald-500 pl-3">Supabase 配置</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-sm text-gray-500">Project URL</label>
            <input 
              value={localSettings.supabase.projectUrl}
              onChange={(e) => handleChange('supabase', 'projectUrl', e.target.value)}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-500">Publishable Key (Anon Key)</label>
            <input 
              type={showSecrets ? "text" : "password"}
              value={localSettings.supabase.publishableKey}
              onChange={(e) => handleChange('supabase', 'publishableKey', e.target.value)}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-sm text-gray-500">Connection String (PostgreSQL)</label>
            <input 
              type={showSecrets ? "text" : "password"}
              value={localSettings.supabase.connectionString}
              onChange={(e) => handleChange('supabase', 'connectionString', e.target.value)}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-500">Supa名称</label>
            <input 
              value={localSettings.supabase.supaName}
              onChange={(e) => handleChange('supabase', 'supaName', e.target.value)}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
        </div>
      </section>

      {/* Scanner Settings */}
      <section className="bg-white p-6 rounded-xl shadow-sm space-y-6">
        <h3 className="text-lg font-semibold border-l-4 border-indigo-500 pl-3">扫描模块设置</h3>
        
        {/* Stage 0 */}
        <div className="space-y-4 border-b pb-6">
          <h4 className="font-bold text-gray-700 flex items-center gap-2">
            <span className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs">S0</span>
            全市场扫描 (Stage 0)
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-gray-500">绝对周期</label>
              <input value={localSettings.scanner.stage0Period} onChange={(e) => handleScannerChange('stage0Period', e.target.value)} className="w-full p-2 border rounded-lg text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">启动时间 (HH:mm)</label>
              <input value={localSettings.scanner.stage0StartTime} onChange={(e) => handleScannerChange('stage0StartTime', e.target.value)} className="w-full p-2 border rounded-lg text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">K线周期 (用于计算数量)</label>
              <input value={localSettings.scanner.stage0KLineInterval} onChange={(e) => handleScannerChange('stage0KLineInterval', e.target.value)} className="w-full p-2 border rounded-lg text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">K线数量下限</label>
              <input type="number" value={isNaN(localSettings.scanner.stage0KCountMin) ? '' : localSettings.scanner.stage0KCountMin} onChange={(e) => handleScannerChange('stage0KCountMin', parseInt(e.target.value))} className="w-full p-2 border rounded-lg text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">K线数量上限</label>
              <input type="number" value={isNaN(localSettings.scanner.stage0KCountMax) ? '' : localSettings.scanner.stage0KCountMax} onChange={(e) => handleScannerChange('stage0KCountMax', parseInt(e.target.value))} className="w-full p-2 border rounded-lg text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">自定义扫描时长 (分钟)</label>
              <input type="number" value={isNaN(localSettings.scanner.stage0CustomMinutes) ? '' : localSettings.scanner.stage0CustomMinutes} onChange={(e) => handleScannerChange('stage0CustomMinutes', parseInt(e.target.value))} className="w-full p-2 border rounded-lg text-sm" />
            </div>
          </div>
        </div>

        {/* Stage 0P */}
        <div className="space-y-4 border-b pb-6 bg-indigo-50/30 p-4 rounded-xl">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-indigo-700 flex items-center gap-2">
              <span className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center text-xs">0P</span>
              第0阶段扫描 (Stage 0P)
            </h4>
            <div className="flex items-center gap-2">
              <input 
                type="checkbox" 
                checked={localSettings.scanner.stage0PEnabled} 
                onChange={(e) => handleScannerChange('stage0PEnabled', e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
              />
              <span className="text-sm font-medium text-indigo-600">启用 0P 扫描</span>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-gray-500">自定义绝对周期</label>
              <input value={localSettings.scanner.stage0PPeriod} onChange={(e) => handleScannerChange('stage0PPeriod', e.target.value)} className="w-full p-2 border rounded-lg text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">自定义启动时间 (HH:mm:ss.SSS)</label>
              <input value={localSettings.scanner.stage0PStartTime} onChange={(e) => handleScannerChange('stage0PStartTime', e.target.value)} className="w-full p-2 border rounded-lg text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 15m */}
            <div className="p-3 bg-white rounded-lg border border-indigo-100 space-y-2">
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={localSettings.scanner.stage0P15mEnabled} onChange={(e) => handleScannerChange('stage0P15mEnabled', e.target.checked)} />
                <span className="text-xs font-bold text-gray-600">15分K线</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-gray-400">数量</label>
                  <input type="number" value={localSettings.scanner.stage0P15mCount} onChange={(e) => handleScannerChange('stage0P15mCount', parseInt(e.target.value))} className="w-full p-1 border rounded text-xs" />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400">参考值(%)</label>
                  <input type="number" value={localSettings.scanner.stage0P15mRef} onChange={(e) => handleScannerChange('stage0P15mRef', parseFloat(e.target.value))} className="w-full p-1 border rounded text-xs" />
                </div>
              </div>
            </div>
            {/* 1h */}
            <div className="p-3 bg-white rounded-lg border border-indigo-100 space-y-2">
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={localSettings.scanner.stage0P1hEnabled} onChange={(e) => handleScannerChange('stage0P1hEnabled', e.target.checked)} />
                <span className="text-xs font-bold text-gray-600">1小时K线</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-gray-400">数量</label>
                  <input type="number" value={localSettings.scanner.stage0P1hCount} onChange={(e) => handleScannerChange('stage0P1hCount', parseInt(e.target.value))} className="w-full p-1 border rounded text-xs" />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400">参考值(%)</label>
                  <input type="number" value={localSettings.scanner.stage0P1hRef} onChange={(e) => handleScannerChange('stage0P1hRef', parseFloat(e.target.value))} className="w-full p-1 border rounded text-xs" />
                </div>
              </div>
            </div>
            {/* 4h */}
            <div className="p-3 bg-white rounded-lg border border-indigo-100 space-y-2">
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={localSettings.scanner.stage0P4hEnabled} onChange={(e) => handleScannerChange('stage0P4hEnabled', e.target.checked)} />
                <span className="text-xs font-bold text-gray-600">4小时K线</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-gray-400">数量</label>
                  <input type="number" value={localSettings.scanner.stage0P4hCount} onChange={(e) => handleScannerChange('stage0P4hCount', parseInt(e.target.value))} className="w-full p-1 border rounded text-xs" />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400">参考值(%)</label>
                  <input type="number" value={localSettings.scanner.stage0P4hRef} onChange={(e) => handleScannerChange('stage0P4hRef', parseFloat(e.target.value))} className="w-full p-1 border rounded text-xs" />
                </div>
              </div>
            </div>
            {/* Day */}
            <div className="p-3 bg-white rounded-lg border border-indigo-100 space-y-2">
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={localSettings.scanner.stage0PDayEnabled} onChange={(e) => handleScannerChange('stage0PDayEnabled', e.target.checked)} />
                <span className="text-xs font-bold text-gray-600">日线K线</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-gray-400">数量</label>
                  <input type="number" value={localSettings.scanner.stage0PDayCount} onChange={(e) => handleScannerChange('stage0PDayCount', parseInt(e.target.value))} className="w-full p-1 border rounded text-xs" />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400">参考值(%)</label>
                  <input type="number" value={localSettings.scanner.stage0PDayRef} onChange={(e) => handleScannerChange('stage0PDayRef', parseFloat(e.target.value))} className="w-full p-1 border rounded text-xs" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stage 1 */}
        <div className="space-y-4 border-b pb-6">
          <h4 className="font-bold text-gray-700 flex items-center gap-2">
            <span className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs">S1</span>
            第一阶段 (Stage 1)
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-gray-500">自定义绝对周期</label>
              <input value={localSettings.scanner.stage1Period} onChange={(e) => handleScannerChange('stage1Period', e.target.value)} className="w-full p-2 border rounded-lg text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">自定义启动时间 (HH:mm:ss.SSS)</label>
              <input value={localSettings.scanner.stage1StartTime} onChange={(e) => handleScannerChange('stage1StartTime', e.target.value)} className="w-full p-2 border rounded-lg text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">交易额 M1 下限</label>
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  checked={localSettings.scanner.stage1Cond1Enabled} 
                  onChange={(e) => handleScannerChange('stage1Cond1Enabled', e.target.checked)}
                />
                <input type="number" value={isNaN(localSettings.scanner.stage1MinVolume) ? '' : localSettings.scanner.stage1MinVolume} onChange={(e) => handleScannerChange('stage1MinVolume', parseInt(e.target.value))} className="w-full p-2 border rounded-lg text-sm" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">涨跌幅 K1 (下限-上限)</label>
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  checked={localSettings.scanner.stage1Cond2Enabled} 
                  onChange={(e) => handleScannerChange('stage1Cond2Enabled', e.target.checked)}
                />
                <div className="flex gap-1 w-full">
                  <input type="number" value={isNaN(localSettings.scanner.stage1KLineMin) ? '' : localSettings.scanner.stage1KLineMin} onChange={(e) => handleScannerChange('stage1KLineMin', parseFloat(e.target.value))} className="w-full p-2 border rounded-lg text-sm" />
                  <input type="number" value={isNaN(localSettings.scanner.stage1KLineMax) ? '' : localSettings.scanner.stage1KLineMax} onChange={(e) => handleScannerChange('stage1KLineMax', parseFloat(e.target.value))} className="w-full p-2 border rounded-lg text-sm" />
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-gray-500">白名单 (空格分隔)</label>
              <textarea value={localSettings.scanner.whitelist} onChange={(e) => handleScannerChange('whitelist', e.target.value)} className="w-full p-2 border rounded-lg text-sm h-16" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">黑名单 (空格分隔)</label>
              <textarea value={localSettings.scanner.blacklist} onChange={(e) => handleScannerChange('blacklist', e.target.value)} className="w-full p-2 border rounded-lg text-sm h-16" />
            </div>
          </div>
        </div>

        {/* Stage 2 */}
        <div className="space-y-4">
          <h4 className="font-bold text-gray-700 flex items-center gap-2">
            <span className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center text-xs text-indigo-600">S2</span>
            第二阶段 (Stage 2)
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-gray-500">自定义绝对周期</label>
              <input value={localSettings.scanner.stage2Period} onChange={(e) => handleScannerChange('stage2Period', e.target.value)} className="w-full p-2 border rounded-lg text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">自定义启动时间 (HH:mm:ss.SSS)</label>
              <input value={localSettings.scanner.stage2StartTime} onChange={(e) => handleScannerChange('stage2StartTime', e.target.value)} className="w-full p-2 border rounded-lg text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">冷却期 (分钟)</label>
              <input type="number" value={isNaN(localSettings.scanner.stage2Cooldown) ? '' : localSettings.scanner.stage2Cooldown} onChange={(e) => handleScannerChange('stage2Cooldown', parseInt(e.target.value))} className="w-full p-2 border rounded-lg text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
            {/* Condition 1 */}
            <div className="p-3 bg-gray-50 rounded-xl space-y-2 border border-gray-100">
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  checked={localSettings.scanner.stage2Cond1Enabled} 
                  onChange={(e) => handleScannerChange('stage2Cond1Enabled', e.target.checked)}
                />
                <span className="text-xs font-bold text-gray-600">条件1: K2 范围</span>
              </div>
              <div className="flex gap-2">
                <div className="w-full">
                  <label className="text-[10px] text-gray-400 block">K21 (下限)</label>
                  <input type="number" value={isNaN(localSettings.scanner.stage2K21) ? '' : localSettings.scanner.stage2K21} onChange={(e) => handleScannerChange('stage2K21', parseFloat(e.target.value))} className="w-full p-1.5 border rounded text-xs" />
                </div>
                <div className="w-full">
                  <label className="text-[10px] text-gray-400 block">K22 (上限)</label>
                  <input type="number" value={isNaN(localSettings.scanner.stage2K22) ? '' : localSettings.scanner.stage2K22} onChange={(e) => handleScannerChange('stage2K22', parseFloat(e.target.value))} className="w-full p-1.5 border rounded text-xs" />
                </div>
              </div>
            </div>

            {/* Condition 2 */}
            <div className="p-3 bg-gray-50 rounded-xl space-y-2 border border-gray-100">
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  checked={localSettings.scanner.stage2Cond2Enabled} 
                  onChange={(e) => handleScannerChange('stage2Cond2Enabled', e.target.checked)}
                />
                <span className="text-xs font-bold text-gray-600">条件2: A 范围 (上影线)</span>
              </div>
              <div className="flex gap-2">
                <div className="w-full">
                  <label className="text-[10px] text-gray-400 block">A21 (下限)</label>
                  <input type="number" value={isNaN(localSettings.scanner.stage2A21) ? '' : localSettings.scanner.stage2A21} onChange={(e) => handleScannerChange('stage2A21', parseFloat(e.target.value))} className="w-full p-1.5 border rounded text-xs" />
                </div>
                <div className="w-full">
                  <label className="text-[10px] text-gray-400 block">A22 (上限)</label>
                  <input type="number" value={isNaN(localSettings.scanner.stage2A22) ? '' : localSettings.scanner.stage2A22} onChange={(e) => handleScannerChange('stage2A22', parseFloat(e.target.value))} className="w-full p-1.5 border rounded text-xs" />
                </div>
              </div>
            </div>

            {/* Condition 3 */}
            <div className="p-3 bg-gray-50 rounded-xl space-y-2 border border-gray-100">
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  checked={localSettings.scanner.stage2Cond3Enabled} 
                  onChange={(e) => handleScannerChange('stage2Cond3Enabled', e.target.checked)}
                />
                <span className="text-xs font-bold text-gray-600">条件3: M 范围 (交易额)</span>
              </div>
              <div className="flex gap-2">
                <div className="w-full">
                  <label className="text-[10px] text-gray-400 block">M21 (下限)</label>
                  <input type="number" value={isNaN(localSettings.scanner.stage2M21) ? '' : localSettings.scanner.stage2M21} onChange={(e) => handleScannerChange('stage2M21', parseInt(e.target.value))} className="w-full p-1.5 border rounded text-xs" />
                </div>
                <div className="w-full">
                  <label className="text-[10px] text-gray-400 block">M22 (上限)</label>
                  <input type="number" value={isNaN(localSettings.scanner.stage2M22) ? '' : localSettings.scanner.stage2M22} onChange={(e) => handleScannerChange('stage2M22', parseInt(e.target.value))} className="w-full p-1.5 border rounded text-xs" />
                </div>
              </div>
            </div>

            {/* Condition 4 */}
            <div className="p-3 bg-gray-50 rounded-xl space-y-2 border border-gray-100">
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  checked={localSettings.scanner.stage2Cond4Enabled} 
                  onChange={(e) => handleScannerChange('stage2Cond4Enabled', e.target.checked)}
                />
                <span className="text-xs font-bold text-gray-600">条件4: K5 范围 (5m)</span>
              </div>
              <div className="flex gap-2">
                <div className="w-full">
                  <label className="text-[10px] text-gray-400 block">K51 (下限)</label>
                  <input type="number" value={isNaN(localSettings.scanner.stage2K51) ? '' : localSettings.scanner.stage2K51} onChange={(e) => handleScannerChange('stage2K51', parseFloat(e.target.value))} className="w-full p-1.5 border rounded text-xs" />
                </div>
                <div className="w-full">
                  <label className="text-[10px] text-gray-400 block">K52 (上限)</label>
                  <input type="number" value={isNaN(localSettings.scanner.stage2K52) ? '' : localSettings.scanner.stage2K52} onChange={(e) => handleScannerChange('stage2K52', parseFloat(e.target.value))} className="w-full p-1.5 border rounded text-xs" />
                </div>
              </div>
            </div>

            {/* Condition 5 */}
            <div className="p-3 bg-gray-50 rounded-xl space-y-2 border border-gray-100">
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  checked={localSettings.scanner.stage2Cond5Enabled} 
                  onChange={(e) => handleScannerChange('stage2Cond5Enabled', e.target.checked)}
                />
                <span className="text-xs font-bold text-gray-600">条件5: KB 范围 (BTC)</span>
              </div>
              <div className="flex gap-2">
                <div className="w-full">
                  <label className="text-[10px] text-gray-400 block">KB1 (下限)</label>
                  <input type="number" value={isNaN(localSettings.scanner.stage2KB1) ? '' : localSettings.scanner.stage2KB1} onChange={(e) => handleScannerChange('stage2KB1', parseFloat(e.target.value))} className="w-full p-1.5 border rounded text-xs" />
                </div>
                <div className="w-full">
                  <label className="text-[10px] text-gray-400 block">KB2 (上限)</label>
                  <input type="number" value={isNaN(localSettings.scanner.stage2KB2) ? '' : localSettings.scanner.stage2KB2} onChange={(e) => handleScannerChange('stage2KB2', parseFloat(e.target.value))} className="w-full p-1.5 border rounded text-xs" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Order Settings */}
      <section className="bg-white p-6 rounded-xl shadow-sm space-y-4">
        <h3 className="text-lg font-semibold border-l-4 border-amber-500 pl-3">仓单模块设置</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <label className="text-sm text-gray-500">自定义绝对周期</label>
            <input value={localSettings.order.period} onChange={(e) => handleOrderChange('period', e.target.value)} className="w-full p-2 border rounded-lg" />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-500">自定义启动时间 (HH:mm:ss.SSS)</label>
            <input value={localSettings.order.startTime} onChange={(e) => handleOrderChange('startTime', e.target.value)} className="w-full p-2 border rounded-lg" />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-500">杠杆倍数 L</label>
            <input type="number" value={isNaN(localSettings.order.leverage) ? '' : localSettings.order.leverage} onChange={(e) => handleOrderChange('leverage', parseInt(e.target.value))} className="w-full p-2 border rounded-lg" />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-500">仓位比例 CW (%)</label>
            <input type="number" value={isNaN(localSettings.order.positionRatio) ? '' : localSettings.order.positionRatio * 100} onChange={(e) => handleOrderChange('positionRatio', parseFloat(e.target.value) / 100)} className="w-full p-2 border rounded-lg" />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-500">最大仓位额 KCMAX</label>
            <input type="number" value={isNaN(localSettings.order.maxPositionAmount) ? '' : localSettings.order.maxPositionAmount} onChange={(e) => handleOrderChange('maxPositionAmount', parseInt(e.target.value))} className="w-full p-2 border rounded-lg" />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-500">止盈比例 TPB (%)</label>
            <input type="number" value={isNaN(localSettings.order.takeProfitRatio) ? '' : localSettings.order.takeProfitRatio} onChange={(e) => handleOrderChange('takeProfitRatio', parseFloat(e.target.value))} className="w-full p-2 border rounded-lg" />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-500">止损比例 SLB (%)</label>
            <input type="number" value={isNaN(localSettings.order.stopLossRatio) ? '' : localSettings.order.stopLossRatio} onChange={(e) => handleOrderChange('stopLossRatio', parseFloat(e.target.value))} className="w-full p-2 border rounded-lg" />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-500">正向单窗口 (秒)</label>
            <input type="number" value={isNaN(localSettings.order.forwardOrderWindow) ? '' : localSettings.order.forwardOrderWindow} onChange={(e) => handleOrderChange('forwardOrderWindow', parseFloat(e.target.value))} className="w-full p-2 border rounded-lg" />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-500">最大持仓时间 (分钟)</label>
            <input type="number" value={isNaN(localSettings.order.maxHoldTime) ? '' : localSettings.order.maxHoldTime} onChange={(e) => handleOrderChange('maxHoldTime', parseInt(e.target.value))} className="w-full p-2 border rounded-lg" />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-500">k优收绝对周期</label>
            <input value={localSettings.order.kClosedPeriod} onChange={(e) => handleOrderChange('kClosedPeriod', e.target.value)} className="w-full p-2 border rounded-lg" />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-500">k优收获取窗口开始 (秒)</label>
            <input type="number" value={isNaN(localSettings.order.kClosedWindowStart) ? '' : localSettings.order.kClosedWindowStart} onChange={(e) => handleOrderChange('kClosedWindowStart', parseFloat(e.target.value))} className="w-full p-2 border rounded-lg" />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-500">k优收获取窗口结束 (秒)</label>
            <input type="number" value={isNaN(localSettings.order.kClosedWindowEnd) ? '' : localSettings.order.kClosedWindowEnd} onChange={(e) => handleOrderChange('kClosedWindowEnd', parseFloat(e.target.value))} className="w-full p-2 border rounded-lg" />
          </div>
        </div>
      </section>

      {/* Email Settings */}
      <section className="bg-white p-6 rounded-xl shadow-sm space-y-4">
        <h3 className="text-lg font-semibold border-l-4 border-indigo-500 pl-3">邮件通知设置</h3>
        <div className="flex items-center gap-2 mb-4">
          <input 
            type="checkbox" 
            checked={localSettings.email.enabled} 
            onChange={(e) => handleChange('email', 'enabled', e.target.checked)}
            className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
          />
          <label className="text-sm font-medium text-gray-700">启用邮件通知</label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-sm text-gray-500">发件邮箱</label>
            <input value={localSettings.email.from} onChange={(e) => handleChange('email', 'from', e.target.value)} className="w-full p-2 border rounded-lg" />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-500">收件邮箱</label>
            <input value={localSettings.email.to} onChange={(e) => handleChange('email', 'to', e.target.value)} className="w-full p-2 border rounded-lg" />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-500">SMTP 服务器</label>
            <input value={localSettings.email.smtp} onChange={(e) => handleChange('email', 'smtp', e.target.value)} className="w-full p-2 border rounded-lg" />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-500">SMTP 端口</label>
            <input type="number" value={isNaN(localSettings.email.port) ? '' : localSettings.email.port} onChange={(e) => handleChange('email', 'port', parseInt(e.target.value))} className="w-full p-2 border rounded-lg" />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-500">邮箱密码/授权码</label>
            <input 
              type={showSecrets ? "text" : "password"}
              value={localSettings.email.pass} 
              onChange={(e) => handleChange('email', 'pass', e.target.value)} 
              className="w-full p-2 border rounded-lg" 
            />
          </div>
        </div>

        <div className="pt-4 border-t space-y-4">
          <h4 className="text-sm font-bold text-gray-700">触发条件</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3 bg-gray-50 rounded-xl space-y-2">
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  checked={localSettings.email.balanceLimitEnabled} 
                  onChange={(e) => handleChange('email', 'balanceLimitEnabled', e.target.checked)}
                />
                <span className="text-xs font-bold text-gray-600">账户余额下限</span>
              </div>
              <input type="number" value={isNaN(localSettings.email.balanceLimit) ? '' : localSettings.email.balanceLimit} onChange={(e) => handleChange('email', 'balanceLimit', parseFloat(e.target.value))} className="w-full p-1.5 border rounded text-xs" />
            </div>
            <div className="p-3 bg-gray-50 rounded-xl space-y-2">
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  checked={localSettings.email.reverseOrderLimitEnabled} 
                  onChange={(e) => handleChange('email', 'reverseOrderLimitEnabled', e.target.checked)}
                />
                <span className="text-xs font-bold text-gray-600">连续反向单上限</span>
              </div>
              <input type="number" value={isNaN(localSettings.email.reverseOrderLimit) ? '' : localSettings.email.reverseOrderLimit} onChange={(e) => handleChange('email', 'reverseOrderLimit', parseInt(e.target.value))} className="w-full p-1.5 border rounded text-xs" />
            </div>
          </div>
        </div>
      </section>

      {/* Security Settings */}
      <section className="bg-white p-6 rounded-xl shadow-sm space-y-4">
        <h3 className="text-lg font-semibold border-l-4 border-indigo-500 pl-3">安全设置</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-sm text-gray-500">锁屏密码</label>
            <input 
              type={showSecrets ? "text" : "password"}
              value={localSettings.lockPassword}
              onChange={(e) => handleChange('lockPassword', '', e.target.value)}
              className="w-full p-2 border rounded-lg"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-gray-500">自动锁屏时长 (分钟)</label>
            <input type="number" value={isNaN(localSettings.lockTimeout) ? '' : localSettings.lockTimeout} onChange={(e) => handleChange('lockTimeout', '', parseInt(e.target.value))} className="w-full p-2 border rounded-lg" />
          </div>
        </div>
      </section>
    </div>
  );
};
