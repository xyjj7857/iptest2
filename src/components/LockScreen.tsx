import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Unlock, ShieldAlert } from 'lucide-react';

interface LockScreenProps {
  correctPassword: string;
  onUnlock: () => void;
}

export const LockScreen: React.FC<LockScreenProps> = ({ correctPassword, onUnlock }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === correctPassword) {
      onUnlock();
    } else {
      setError(true);
      setTimeout(() => setError(false), 500);
      setPassword('');
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-gray-900 flex items-center justify-center p-6">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 text-center space-y-8"
      >
        <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto text-indigo-600">
          <Lock size={40} />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">系统已锁定</h1>
          <p className="text-gray-500">请输入锁屏密码以继续访问超强交易系统</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <motion.div 
            animate={error ? { x: [-10, 10, -10, 10, 0] } : {}}
            className="relative"
          >
            <input 
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="输入密码"
              autoFocus
              className={`w-full p-4 bg-gray-50 border-2 rounded-2xl text-center text-xl font-bold tracking-widest outline-none transition-colors ${error ? 'border-red-500 bg-red-50' : 'border-transparent focus:border-indigo-500'}`}
            />
            {error && (
              <div className="absolute -bottom-6 left-0 right-0 text-red-500 text-xs flex items-center justify-center gap-1">
                <ShieldAlert size={12} /> 密码错误，请重试
              </div>
            )}
          </motion.div>

          <button 
            type="submit"
            className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold text-lg shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <Unlock size={20} /> 解锁系统
          </button>
        </form>

        <div className="pt-4 text-[10px] text-gray-400 uppercase tracking-widest">
          Super Strong Trading System v1.0
        </div>
      </motion.div>
    </div>
  );
};
