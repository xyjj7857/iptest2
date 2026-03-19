import React from 'react';
import { LayoutDashboard, Search, FileText, Settings, Power, Lock } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  masterSwitch: boolean;
  onToggleMaster: (val: boolean) => void;
  onLock: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab, masterSwitch, onToggleMaster, onLock }) => {
  const tabs = [
    { id: 'dashboard', label: '总览', icon: <LayoutDashboard size={20} /> },
    { id: 'scanner', label: '扫描', icon: <Search size={20} /> },
    { id: 'logs', label: '日志', icon: <FileText size={20} /> },
    { id: 'settings', label: '设置', icon: <Settings size={20} /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 h-16 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-black italic">超</div>
            <h1 className="text-xl font-black tracking-tighter text-gray-900">超强交易系统</h1>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={onLock}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
              title="手动锁屏"
            >
              <Lock size={20} />
            </button>

            <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-full">
              <button 
                onClick={() => onToggleMaster(true)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${masterSwitch ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200' : 'text-gray-400'}`}
              >
                开启
              </button>
              <button 
                onClick={() => onToggleMaster(false)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${!masterSwitch ? 'bg-rose-500 text-white shadow-lg shadow-rose-200' : 'text-gray-400'}`}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-2 z-50">
        <div className="max-w-md mx-auto flex justify-between items-center">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center gap-1 px-4 py-2 rounded-2xl transition-all ${activeTab === tab.id ? 'text-indigo-600 bg-indigo-50' : 'text-gray-400 hover:text-gray-600'}`}
            >
              {tab.icon}
              <span className="text-[10px] font-bold">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
};
