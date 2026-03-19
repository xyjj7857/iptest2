import React, { useState } from 'react';
import { LogEntry } from '../types';
import { ChevronDown, ChevronUp, Trash2, Clock, Info, AlertTriangle, XCircle, Download } from 'lucide-react';
import { exportToExcel } from '../utils/exportUtils';

interface LogViewProps {
  logs: LogEntry[];
  onClear: () => void;
}

export const LogView: React.FC<LogViewProps> = ({ logs, onClear }) => {
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    const next = new Set(expandedLogs);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedLogs(next);
  };

  const getIcon = (type: LogEntry['type']) => {
    switch (type) {
      case 'scanner': return <Info className="text-blue-500" size={16} />;
      case 'order': return <Clock className="text-emerald-500" size={16} />;
      case 'error': return <XCircle className="text-red-500" size={16} />;
      default: return <AlertTriangle className="text-amber-500" size={16} />;
    }
  };

  return (
    <div className="space-y-4 pb-20">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm">
        <h2 className="text-xl font-bold text-gray-800">系统日志</h2>
        <div className="flex gap-2">
          <button 
            onClick={() => {
              if (logs.length > 0) {
                const exportData = logs.map(l => ({
                  ID: l.id,
                  时间: new Date(l.timestamp).toLocaleString(),
                  模块: l.module,
                  类型: l.type,
                  消息: l.message,
                  详情: l.details ? JSON.stringify(l.details) : ''
                }));
                exportToExcel(exportData, `日志_${new Date().getTime()}`, '日志');
              }
            }}
            disabled={logs.length === 0}
            className="flex items-center gap-2 text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            <Download size={18} /> 导出 Excel
          </button>
          <button 
            onClick={onClear}
            className="flex items-center gap-2 text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Trash2 size={18} /> 清空日志
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {logs.length === 0 ? (
          <div className="p-10 text-center text-gray-400">暂无日志记录</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {logs.map((log) => (
              <div key={log.id} className="hover:bg-gray-50 transition-colors">
                <div 
                  className="p-4 flex items-center gap-4 cursor-pointer"
                  onClick={() => toggleExpand(log.id)}
                >
                  <div className="flex-shrink-0">{getIcon(log.type)}</div>
                  <div className="flex-shrink-0 text-xs text-gray-400 font-mono">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </div>
                  <div className="flex-shrink-0 px-2 py-0.5 rounded bg-gray-100 text-[10px] font-bold text-gray-500 uppercase">
                    {log.module}
                  </div>
                  <div className="flex-grow text-sm text-gray-700 truncate">
                    {log.message}
                  </div>
                  <div className="flex-shrink-0 text-gray-400">
                    {expandedLogs.has(log.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>
                {expandedLogs.has(log.id) && log.details && (
                  <div className="px-14 pb-4">
                    <pre className="bg-gray-900 text-gray-300 p-3 rounded-lg text-xs overflow-x-auto">
                      {JSON.stringify(log.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
