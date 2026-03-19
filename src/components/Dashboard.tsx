import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Activity, Wallet, TrendingUp, TrendingDown, Clock, BarChart3, Globe, Zap, ShieldX, Eye, EyeOff, Copy, CheckCircle2, Download } from 'lucide-react';
import { exportToExcel } from '../utils/exportUtils';

interface DashboardProps {
  state: any;
  ip: string;
}

export const Dashboard: React.FC<DashboardProps> = ({ state, ip }) => {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const account = state.accountInfo;
  const balance = parseFloat(account?.totalWalletBalance || '0').toFixed(2);
  const available = parseFloat(account?.availableBalance || '0').toFixed(2);
  const pnl = parseFloat(account?.totalUnrealizedProfit || '0');
  const best = state.bestSymbol;

  const formatTime = (timestamp: number) => {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false });
  };

  const formatPrice = (price: number, refPrice: string | number) => {
    const refStr = refPrice.toString();
    const decimals = refStr.includes('.') ? refStr.split('.')[1].length : 0;
    return price?.toFixed(decimals);
  };

  return (
    <div className="space-y-6 pb-20">
      {/* API Error Alert */}
      {state.apiError && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-rose-50 border border-rose-200 p-4 rounded-2xl flex gap-4 items-start"
        >
          <div className="p-2 bg-rose-100 rounded-xl text-rose-600 flex-shrink-0">
            <ShieldX size={24} />
          </div>
          <div className="space-y-1">
            <h4 className="text-rose-800 font-bold text-sm">API 连接错误</h4>
            <p className="text-rose-600 text-xs leading-relaxed">
              错误详情: {state.apiError}
            </p>
            <div className="pt-2 space-y-2">
              <p className="text-rose-700 text-[10px] font-bold uppercase tracking-wider">必须执行的操作 (MANDATORY):</p>
              <div className="bg-white/50 p-3 rounded-xl border border-rose-200 space-y-2">
                <p className="text-rose-800 text-xs">
                  1. 登录币安官网，进入 <span className="font-bold">API 管理</span>
                </p>
                <p className="text-rose-800 text-xs">
                  2. 找到您的 API Key，点击 <span className="font-bold">“修改限制”</span>
                </p>
                <p className="text-rose-800 text-xs">
                  3. 勾选 <span className="font-bold text-rose-600 underline">“启用合约” (Enable Futures)</span>
                </p>
                <p className="text-rose-800 text-xs">
                  4. 在 IP 访问限制中选择 <span className="font-bold">“只允许受信任 IP”</span>，并添加:
                </p>
                <div className="relative group">
                  <div className="bg-rose-600 text-white font-mono font-bold text-center py-3 rounded-xl shadow-inner text-xl tracking-wider">
                    {ip}
                  </div>
                  <button 
                    onClick={() => copyToClipboard(ip)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors text-white"
                    title="复制 IP 地址"
                  >
                    {copied ? <CheckCircle2 size={18} /> : <Copy size={18} />}
                  </button>
                </div>
                <div className="bg-rose-100/50 p-2 rounded-lg space-y-1">
                  <p className="text-rose-700 text-[10px] font-bold">排查清单:</p>
                  <ul className="text-[10px] text-rose-600 list-disc list-inside space-y-0.5">
                    <li>确认 API Key 和 Secret Key 是否填写正确（无空格）</li>
                    <li>确认是否使用的是 <span className="font-bold">实盘</span> API Key（非测试网）</li>
                    <li>确认 Base URL 是否为 <span className="font-bold">https://fapi.binance.com</span></li>
                    <li>Cloud Run IP 可能会变动，若报错 IP 不符，请更新白名单</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Account Overview */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-gray-800">账户概览</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div 
          whileHover={{ y: -5 }}
          className="bg-gradient-to-br from-indigo-600 to-violet-700 p-6 rounded-3xl text-white shadow-xl shadow-indigo-200"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-white/20 rounded-xl"><Wallet size={24} /></div>
            <div className="text-xs font-bold bg-white/20 px-2 py-1 rounded">USDT-M</div>
          </div>
          <div className="text-sm opacity-80 mb-1">账户总余额</div>
          <div className="text-3xl font-bold mb-4 flex items-center gap-3">
            ${balance}
            <div className="flex gap-1.5">
              <div className="flex flex-col items-center bg-white/10 px-2 py-1 rounded-lg border border-white/10">
                <span className="text-[8px] opacity-60 leading-none mb-1">仓单</span>
                <span className="text-xs leading-none">{state.activePosition ? 1 : 0}</span>
              </div>
              <div className="flex flex-col items-center bg-white/10 px-2 py-1 rounded-lg border border-white/10">
                <span className="text-[8px] opacity-60 leading-none mb-1">委托</span>
                <span className="text-xs leading-none">{state.activeOrders?.length || 0}</span>
              </div>
              {state.activePosition && (
                <div className="flex flex-col items-center bg-emerald-400/20 px-2 py-1 rounded-lg border border-emerald-400/20">
                  <span className="text-[8px] text-emerald-300 font-bold leading-none mb-1">当前持仓</span>
                  <span className="text-xs text-emerald-100 leading-none font-bold">{state.activePosition.symbol}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-between text-xs opacity-80">
            <span>可用余额: ${available}</span>
            <span className={pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
              未实现盈亏: ${pnl?.toFixed(2)}
            </span>
          </div>
        </motion.div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col justify-between">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-gray-500 text-sm font-medium">系统状态</h3>
            <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${state.wsStatus === 'OPEN' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
              <Activity size={12} /> WS: {state.wsStatus}
            </div>
            <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${state.apiError ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
              <ShieldX size={12} /> API: {state.apiError ? 'ERROR' : 'CONNECTED'}
            </div>
          </div>
          <div className="space-y-3">
            {state.wsError && (
              <div className="text-[10px] text-rose-500 font-bold bg-rose-50 p-1 rounded border border-rose-100">
                {state.wsError}
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-400 flex items-center gap-1"><Clock size={12} /> 数据更新</span>
              <span className="text-sm font-mono font-bold text-gray-700">
                {state.lastWSMessageTime > 0 ? `${((Date.now() - state.lastWSMessageTime) / 1000)?.toFixed(1)}s前` : '等待中...'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-400 flex items-center gap-1"><Globe size={12} /> 服务器 IP (Cloud Run)</span>
              <span className="text-sm font-mono font-bold text-gray-700">{ip}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-400 flex items-center gap-1"><ShieldX size={12} /> API 接口</span>
              <span className={`text-sm font-bold ${state.apiError ? 'text-rose-500' : 'text-emerald-500'}`}>
                {state.apiError ? '连接错误' : '连接正常'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-400 flex items-center gap-1"><Zap size={12} /> 策略引擎</span>
              <span className={`text-sm font-bold ${state.masterSwitch ? 'text-emerald-500' : 'text-gray-400'}`}>
                {state.masterSwitch ? '运行中' : '已停止'}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col justify-between">
          <h3 className="text-gray-500 text-sm font-medium mb-4">BTC 实时行情</h3>
          {state.btcData ? (
            <div className="space-y-2">
              <div className="text-2xl font-bold text-gray-800">${parseFloat(state.btcData.c)?.toFixed(2)}</div>
              <div className={`text-sm font-bold flex items-center gap-1 ${parseFloat(state.btcData.c) >= parseFloat(state.btcData.o) ? 'text-emerald-500' : 'text-rose-500'}`}>
                {parseFloat(state.btcData.c) >= parseFloat(state.btcData.o) ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                {(((parseFloat(state.btcData.c) - parseFloat(state.btcData.o)) / parseFloat(state.btcData.o)) * 100)?.toFixed(2)}%
              </div>
            </div>
          ) : (
            <div className="animate-pulse bg-gray-100 h-12 rounded-xl"></div>
          )}
        </div>
      </div>

      {/* Best Symbol Details */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap size={20} className="text-amber-500" /> 优选币对详情
          </div>
          {best && best.isProcessed && (
            <div className={`text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 ${
              best.processStatus === 'ordered' ? 'bg-emerald-100 text-emerald-600' : 
              best.processStatus === 'missed' ? 'bg-rose-100 text-rose-600' : 
              'bg-gray-100 text-gray-600'
            }`}>
              {best.processStatus === 'ordered' ? '已下单' : 
               best.processStatus === 'missed' ? '已错过窗口' : 
               '已过期'}
            </div>
          )}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="p-3 bg-gray-50 rounded-xl">
            <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">优选币对</div>
            <div className="text-sm font-bold text-gray-800">{best?.symbol || '-'}</div>
          </div>
          <div className="p-3 bg-gray-50 rounded-xl">
            <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">dprice</div>
            <div className="text-sm font-mono font-bold text-gray-700">{best ? `$${best.price}` : '-'}</div>
          </div>
          <div className="p-3 bg-gray-50 rounded-xl">
            <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">k优开</div>
            <div className="text-sm font-mono font-bold text-gray-700">{best ? `$${best.kClosedOpen || best.open}` : '-'}</div>
          </div>
          <div className="p-3 bg-gray-50 rounded-xl">
            <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">k优收</div>
            <div className="text-sm font-mono font-bold text-gray-700">{best ? `$${best.kClosedClose || best.close}` : '-'}</div>
          </div>
          <div className="p-3 bg-gray-50 rounded-xl">
            <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">k15涨跌幅</div>
            <div className={`text-sm font-bold ${ (best?.kClosedChange ?? best?.k15Change) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
              {best ? `${(best.kClosedChange ?? best.k15Change)?.toFixed(4)}%` : '-'}
            </div>
          </div>
          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
            <div className="text-[10px] text-emerald-400 font-bold uppercase mb-1">理论止盈价</div>
            <div className="text-sm font-mono font-bold text-emerald-600">
              {best ? `$${best.tpPrice}` : '-'}
            </div>
          </div>
          <div className="p-3 bg-rose-50 rounded-xl border border-rose-100">
            <div className="text-[10px] text-rose-400 font-bold uppercase mb-1">理论止损价</div>
            <div className="text-sm font-mono font-bold text-rose-600">
              {best ? `$${best.slPrice}` : '-'}
            </div>
          </div>
          <div className="p-3 bg-gray-50 rounded-xl">
            <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">成交额</div>
            <div className="text-sm font-mono font-bold text-gray-700">{best ? `$${best.volume?.toLocaleString()}` : '-'}</div>
          </div>
          <div className="p-3 bg-gray-50 rounded-xl">
            <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">选定时间</div>
            <div className="text-sm font-mono font-bold text-gray-700">
              {state.scanTimes.bestSelectionTime ? new Date(state.scanTimes.bestSelectionTime).toLocaleTimeString() + '.' + (state.scanTimes.bestSelectionTime % 1000).toString().padStart(3, '0') : '-'}
            </div>
          </div>
        </div>
      </div>

      {/* Active Position */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity size={20} className="text-emerald-500" /> 当前持仓 (正向单)
          </div>
          <button 
            onClick={() => {
              if (state.activePosition) {
                exportToExcel([state.activePosition], `持仓_${new Date().getTime()}`, '持仓');
              }
            }}
            disabled={!state.activePosition}
            className="flex items-center gap-1 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-xs font-bold hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Download size={14} /> 导出 Excel
          </button>
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100">
                <th className="pb-3 font-bold w-[15ch] min-w-[15ch]">合约</th>
                <th className="pb-3 font-bold w-[8ch] min-w-[8ch]">方向</th>
                <th className="pb-3 font-bold w-[10ch] min-w-[10ch]">数量</th>
                <th className="pb-3 font-bold w-[10ch] min-w-[10ch]">价值(USDT)</th>
                <th className="pb-3 font-bold w-[6ch] min-w-[6ch]">杠杆</th>
                <th className="pb-3 font-bold w-[10ch] min-w-[10ch]">开仓均价</th>
                <th className="pb-3 font-bold w-[10ch] min-w-[10ch]">当前价格</th>
                <th className="pb-3 font-bold w-[10ch] min-w-[10ch]">未实现盈亏</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {state.activePosition ? (
                <tr className="text-sm">
                  <td className="py-4 font-bold text-gray-800 w-[15ch] min-w-[15ch] truncate">
                    {state.activePosition.symbol}
                    <div className="text-[10px] text-gray-400 font-normal truncate">
                      开仓: {state.activePosition.entryTime ? new Date(state.activePosition.entryTime).toLocaleString() + '.' + (state.activePosition.entryTime % 1000).toString().padStart(3, '0') : '-'}
                    </div>
                  </td>
                  <td className="py-4 w-[8ch] min-w-[8ch]">
                    <span className={`px-2 py-1 rounded text-[10px] font-bold ${state.activePosition.side === 'BUY' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                      {state.activePosition.side === 'BUY' ? '做多' : '做空'}
                    </span>
                  </td>
                  <td className="py-4 font-mono w-[10ch] min-w-[10ch]">{state.activePosition.amount?.toFixed(4)}</td>
                  <td className="py-4 font-mono w-[10ch] min-w-[10ch]">${(state.activePosition.amount * state.activePosition.markPrice)?.toFixed(2)}</td>
                  <td className="py-4 font-mono w-[6ch] min-w-[6ch]">{state.activePosition.leverage}x</td>
                  <td className="py-4 font-mono w-[10ch] min-w-[10ch]">{state.activePosition.entryPrice}</td>
                  <td className="py-4 font-mono w-[10ch] min-w-[10ch]">{state.activePosition.markPrice}</td>
                  <td className={`py-4 font-mono font-bold w-[10ch] min-w-[10ch] ${state.activePosition.unrealizedProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {state.activePosition.unrealizedProfit?.toFixed(2)}
                  </td>
                </tr>
              ) : (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-gray-400 italic">
                    当前无持仓
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Active Orders */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={20} className="text-amber-500" /> 当前委托 (反向单)
          </div>
          <button 
            onClick={() => {
              if (state.activeOrders && state.activeOrders.length > 0) {
                exportToExcel(state.activeOrders, `委托_${new Date().getTime()}`, '委托');
              }
            }}
            disabled={!state.activeOrders || state.activeOrders.length === 0}
            className="flex items-center gap-1 px-3 py-1 bg-amber-50 text-amber-600 rounded-lg text-xs font-bold hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Download size={14} /> 导出 Excel
          </button>
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100">
                <th className="pb-3 font-bold">合约</th>
                <th className="pb-3 font-bold">方向</th>
                <th className="pb-3 font-bold">类型</th>
                <th className="pb-3 font-bold">数量</th>
                <th className="pb-3 font-bold">委托价格</th>
                <th className="pb-3 font-bold">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {state.activeOrders && state.activeOrders.length > 0 ? (
                state.activeOrders.map((order: any) => (
                  <tr key={order.orderId} className="text-sm">
                    <td className="py-4 font-bold text-gray-800">
                      {order.symbol}
                      <div className="text-[10px] text-gray-400 font-normal">ID: {order.orderId}</div>
                    </td>
                    <td className="py-4">
                      <span className={`px-2 py-1 rounded text-[10px] font-bold ${order.side === 'BUY' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                        {order.side === 'BUY' ? '买入' : '卖出'}
                      </span>
                    </td>
                    <td className="py-4 text-xs text-gray-500">
                      {order.type.startsWith('ALGO_') ? (
                        <span className="flex items-center gap-1">
                          <Zap size={10} className="text-amber-500" />
                          <span className="bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-100 font-bold">
                            {order.type.replace('ALGO_', '')}
                          </span>
                        </span>
                      ) : (
                        order.type
                      )}
                    </td>
                    <td className="py-4 font-mono">{order.amount}</td>
                    <td className="py-4 font-mono font-bold text-indigo-600">{order.price}</td>
                    <td className="py-4 text-xs text-gray-400">
                      {new Date(order.time).toLocaleString() + '.' + (order.time % 1000).toString().padStart(3, '0')}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-gray-400 italic">
                    当前无委托单
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
