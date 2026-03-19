import React from 'react';
import { motion } from 'motion/react';
import { Search, Filter, Zap, ShieldCheck, ShieldX } from 'lucide-react';

interface ScannerViewProps {
  state: any;
  onForceStage0: () => void;
  onForceStage0P: () => void;
  onForceStage1: () => void;
  onForceStage2: () => void;
}

export const ScannerView: React.FC<ScannerViewProps> = ({ state, onForceStage0, onForceStage0P, onForceStage1, onForceStage2 }) => {
  const isScanning0 = state.isScanning?.stage0;
  const isScanning0P = state.isScanning?.stage0P;
  const isScanning1 = state.isScanning?.stage1;
  const isScanning2 = state.isScanning?.stage2;

  return (
    <div className="space-y-6 pb-20">
      <div className="bg-white p-4 rounded-xl shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-xl font-bold text-gray-800">扫描控制与详情</h2>
        <div className="flex flex-wrap gap-2">
          <button 
            onClick={onForceStage0}
            disabled={isScanning0}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              isScanning0 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            <Search size={14} className={isScanning0 ? 'animate-spin' : ''} /> 
            {isScanning0 ? '扫零中...' : '强制扫零'}
          </button>
          <button 
            onClick={onForceStage0P}
            disabled={isScanning0P}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              isScanning0P ? 'bg-indigo-50 text-indigo-300 cursor-not-allowed' : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-600'
            }`}
          >
            <Filter size={14} className={isScanning0P ? 'animate-spin' : ''} /> 
            {isScanning0P ? '扫0P中...' : '强制扫0P'}
          </button>
          <button 
            onClick={onForceStage1}
            disabled={isScanning1}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              isScanning1 ? 'bg-indigo-50 text-indigo-300 cursor-not-allowed' : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-600'
            }`}
          >
            <Filter size={14} className={isScanning1 ? 'animate-spin' : ''} /> 
            {isScanning1 ? '扫一中...' : '强制扫一'}
          </button>
          <button 
            onClick={onForceStage2}
            disabled={isScanning2}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              isScanning2 ? 'bg-amber-50 text-amber-300 cursor-not-allowed' : 'bg-amber-50 hover:bg-amber-100 text-amber-600'
            }`}
          >
            <Zap size={14} className={isScanning2 ? 'animate-spin' : ''} /> 
            {isScanning2 ? '扫二中...' : '强制扫二'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stage 0 Results */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Search size={20} className="text-gray-500" /> 全市场结果 (扫零)
              <div className="text-[10px] text-gray-400 font-bold ml-2 bg-gray-100 px-2 py-0.5 rounded">
                倒计时: {state.scanTimes?.stage0Countdown || 0}s
              </div>
            </div>
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
              {state.stage0Results?.length || 0}
            </span>
          </h3>
          <div className="mb-4 space-y-1">
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>上一轮开始:</span>
              <span className="font-mono">{state.scanTimes?.stage0LastStart ? new Date(state.scanTimes.stage0LastStart).toLocaleTimeString('zh-CN', { hour12: false }) : '-'}</span>
            </div>
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>下一轮开始:</span>
              <span className="font-mono">{state.scanTimes?.stage0NextStart ? new Date(state.scanTimes.stage0NextStart).toLocaleTimeString('zh-CN', { hour12: false }) : '-'}</span>
            </div>
          </div>
          {isScanning0 && (
            <div className="w-full bg-gray-100 h-1 rounded-full overflow-hidden mb-4">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${state.isScanning.stage0Progress}%` }}
                className="bg-gray-400 h-full"
              />
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 max-h-[400px] overflow-y-auto pr-2">
            {state.stage0Results?.map((symbol: string) => (
              <div key={symbol} className="bg-gray-50 p-2 rounded-lg text-[10px] font-bold text-gray-500 text-center border border-gray-100">
                {symbol}
              </div>
            ))}
            {(!state.stage0Results || state.stage0Results.length === 0) && (
              <div className="col-span-full py-10 text-center text-gray-400 text-sm">暂无数据</div>
            )}
          </div>
        </div>

        {/* Stage 0P Results */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter size={20} className="text-indigo-500" /> 0P 过滤结果 (扫0P)
              <div className="text-[10px] text-indigo-400 font-bold ml-2 bg-indigo-50 px-2 py-0.5 rounded">
                倒计时: {state.scanTimes?.stage0PCountdown || 0}s
              </div>
            </div>
            <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full">
              {state.stage0PResults?.length || 0}
            </span>
          </h3>
          <div className="mb-4 space-y-1">
            <div className="flex justify-between text-[10px] text-indigo-400">
              <span>上一轮开始:</span>
              <span className="font-mono">{state.scanTimes?.stage0PLastStart ? new Date(state.scanTimes.stage0PLastStart).toLocaleTimeString('zh-CN', { hour12: false }) : '-'}</span>
            </div>
            <div className="flex justify-between text-[10px] text-indigo-400">
              <span>下一轮开始:</span>
              <span className="font-mono">{state.scanTimes?.stage0PNextStart ? new Date(state.scanTimes.stage0PNextStart).toLocaleTimeString('zh-CN', { hour12: false }) : '-'}</span>
            </div>
          </div>
          {isScanning0P && (
            <div className="w-full bg-indigo-50 h-1 rounded-full overflow-hidden mb-4">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${state.isScanning.stage0PProgress}%` }}
                className="bg-indigo-500 h-full"
              />
            </div>
          )}
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
            {state.stage0PResults?.map((symbol: string) => (
              <div key={symbol} className="bg-indigo-50 p-2 rounded-lg text-[10px] font-bold text-indigo-600 text-center border border-indigo-100">
                {symbol}
              </div>
            ))}
            {state.stage0PReasons && Object.keys(state.stage0PReasons).length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase mb-2">过滤原因</h4>
                <div className="space-y-1">
                  {Object.entries(state.stage0PReasons).map(([symbol, reason]: [string, any]) => (
                    <div key={symbol} className="flex justify-between items-center text-[9px] bg-rose-50 p-1.5 rounded border border-rose-100">
                      <span className="font-bold text-gray-700">{symbol}</span>
                      <span className="text-rose-500">{reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(!state.stage0PResults || state.stage0PResults.length === 0) && (!state.stage0PReasons || Object.keys(state.stage0PReasons).length === 0) && (
              <div className="py-10 text-center text-gray-400 text-sm">暂无数据</div>
            )}
          </div>
        </div>

        {/* Stage 1 Results */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter size={20} className="text-indigo-500" /> 第一阶段结果 (扫一)
              <div className="text-[10px] text-indigo-400 font-bold ml-2 bg-indigo-50 px-2 py-0.5 rounded">
                倒计时: {state.scanTimes?.stage1Countdown || 0}s
              </div>
            </div>
            <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full">
              {state.stage1Results?.length || 0}
            </span>
          </h3>
          <div className="mb-4 space-y-1">
            <div className="flex justify-between text-[10px] text-indigo-400">
              <span>上一轮开始:</span>
              <span className="font-mono">{state.scanTimes?.stage1LastStart ? new Date(state.scanTimes.stage1LastStart).toLocaleTimeString('zh-CN', { hour12: false }) : '-'}</span>
            </div>
            <div className="flex justify-between text-[10px] text-indigo-400">
              <span>下一轮开始:</span>
              <span className="font-mono">{state.scanTimes?.stage1NextStart ? new Date(state.scanTimes.stage1NextStart).toLocaleTimeString('zh-CN', { hour12: false }) : '-'}</span>
            </div>
          </div>
          {isScanning1 && (
            <div className="w-full bg-indigo-50 h-1 rounded-full overflow-hidden mb-4">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${state.isScanning.stage1Progress}%` }}
                className="bg-indigo-500 h-full"
              />
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 max-h-[400px] overflow-y-auto pr-2">
            {state.stage1Results?.map((symbol: string) => (
              <div key={symbol} className="bg-indigo-50 p-2 rounded-lg text-[10px] font-bold text-indigo-600 text-center border border-indigo-100">
                {symbol}
              </div>
            ))}
            {(!state.stage1Results || state.stage1Results.length === 0) && (
              <div className="col-span-full py-10 text-center text-gray-400 text-sm">暂无数据</div>
            )}
          </div>
        </div>

        {/* Stage 2 Candidates */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap size={20} className="text-amber-500" /> 第二阶段待选 (扫二)
              <div className="text-[10px] text-amber-500 font-bold ml-2 bg-amber-50 px-2 py-0.5 rounded">
                倒计时: {state.scanTimes?.stage2Countdown || 0}s
              </div>
            </div>
            <span className="text-xs bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full">
              {state.stage2Results?.length || 0}
            </span>
          </h3>
          <div className="mb-4 space-y-1">
            <div className="flex justify-between text-[10px] text-amber-500">
              <span>上一轮开始:</span>
              <span className="font-mono">{state.scanTimes?.stage2LastStart ? new Date(state.scanTimes.stage2LastStart).toLocaleTimeString('zh-CN', { hour12: false }) : '-'}</span>
            </div>
            <div className="flex justify-between text-[10px] text-amber-500">
              <span>下一轮开始:</span>
              <span className="font-mono">{state.scanTimes?.stage2NextStart ? new Date(state.scanTimes.stage2NextStart).toLocaleTimeString('zh-CN', { hour12: false }) : '-'}</span>
            </div>
          </div>
          {isScanning2 && (
            <div className="w-full bg-amber-50 h-1 rounded-full overflow-hidden mb-4">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${state.isScanning.stage2Progress}%` }}
                className="bg-amber-500 h-full"
              />
            </div>
          )}
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
            {state.stage2Results?.map((item: any, idx: number) => (
              <motion.div 
                key={item.symbol}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className={`p-4 rounded-2xl border flex flex-col gap-2 ${idx === 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-100'}`}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <div className="text-sm font-bold text-gray-800">{item.symbol}</div>
                    <div className="text-[10px] text-gray-400 uppercase font-bold">成交额: ${item.volume?.toLocaleString()}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-mono font-bold text-gray-700">${item.price}</div>
                    {idx === 0 && <div className="text-[10px] text-amber-600 font-bold uppercase">最优币对</div>}
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1 text-[9px] font-mono text-gray-500 border-t border-gray-100 pt-2">
                  <div>k2:{item.kAbsChange?.toFixed(2)}%</div>
                  <div>a:{item.aChange?.toFixed(2)}%</div>
                  <div>k5:{item.k5Change?.toFixed(2)}%</div>
                  <div>kb:{item.kbChange?.toFixed(2)}%</div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[9px] font-mono border-t border-gray-50 pt-2">
                  <div className="text-emerald-600">理论止盈: ${item.tpPrice}</div>
                  <div className="text-rose-600">理论止损: ${item.slPrice}</div>
                </div>
              </motion.div>
            ))}
            {(!state.stage2Results || state.stage2Results.length === 0) && (
              <div className="py-10 text-center text-gray-400 text-sm">等待扫描触发...</div>
            )}

            {/* Failed Coins */}
            {state.stage2Failed?.length > 0 && (
              <div className="mt-6 pt-6 border-t border-gray-100">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">不符合条件币对</h4>
                <div className="space-y-2">
                  {state.stage2Failed.map((item: any) => (
                    <div key={item.symbol} className="p-3 bg-rose-50/50 rounded-xl border border-rose-100/50 flex justify-between items-start">
                      <div>
                        <div className="text-xs font-bold text-gray-700">{item.symbol}</div>
                        <div className="text-[10px] text-rose-500 font-bold">{item.reason}</div>
                      </div>
                      <div className="text-[9px] text-gray-400 font-mono text-right">
                        k2:{item.kAbsChange?.toFixed(2)}% a:{item.aChange?.toFixed(2)}%<br/>
                        k5:{item.k5Change?.toFixed(2)}% kb:{item.kbChange?.toFixed(2)}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
