import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAdvisorStore } from '../stores/advisorStore';
import { useWishlistStore } from '../stores/wishlistStore';
import { useImpulseStore } from '../stores/impulseStore';
import { useWishpoolStore } from '../stores/wishpoolStore';
import { aiClient } from '../ai/client';
import type { PurchaseAdvice } from '../ai/types';

interface BuyDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const QUICK_PROMPTS = [
  '一杯奶茶 ¥28',
  '一件卫衣 ¥199',
  '一双球鞋 ¥599',
  '一个手办 ¥399',
];

// 从用户输入文字里提取金额，纯正则，不调 AI
function extractAmount(text: string): number | null {
  const match = text.match(/[¥￥]?\s*(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
}

export function BuyDrawer({ isOpen, onClose }: BuyDrawerProps) {
  const [input, setInput] = useState('');
  const [advice, setAdvice] = useState<PurchaseAdvice | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [showHoldConfirm, setShowHoldConfirm] = useState(false);
  const [holdAmount, setHoldAmount] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const advisorProfile = useAdvisorStore((s) => s.profile);
  const addItem = useWishlistStore((s) => s.addItem);
  const addImpulse = useImpulseStore((s) => s.add);
  const addSavings = useWishpoolStore((s) => s.addSavings);

  useEffect(() => {
    if (isOpen) {
      setInput('');
      setAdvice(null);
      setLoading(false);
      setShowHoldConfirm(false);
      setHoldAmount('');
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const handleAnalyze = async () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    setAdvice(null);
    try {
      const result = await aiClient.analyzePurchase(input, advisorProfile);
      setAdvice(result);
    } catch {
      setAdvice({
        verdict: 'caution',
        title: '分析失败',
        reason: 'AI 暂时无法连接，要不先自己想想？',
        suggestion: '',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToWishlist = (verdict: PurchaseAdvice['verdict']) => {
    const amount = extractAmount(input) ?? 0;
    addItem({
      title: input.slice(0, 50),
      amount,
      note: advice?.reason || '',
      status: verdict === 'buy' ? 'approved' : 'cooling',
    });
    setShowSavedToast(true);
    setTimeout(() => {
      setShowSavedToast(false);
      onClose();
    }, 1500);
  };

  // 「忍住」是即时决定，独立于 AI 流程：弹确认框预填金额
  const handleHoldClick = () => {
    const amount = extractAmount(input);
    setHoldAmount(amount != null ? String(amount) : '');
    setShowHoldConfirm(true);
  };

  // 确认忍住：累积进许愿池 + 记一笔冲动，不写清单
  const handleConfirmHold = () => {
    const amount = parseFloat(holdAmount);
    const safeAmount = Number.isFinite(amount) && amount > 0 ? amount : 0;
    const description = input.trim().slice(0, 50) || '忍住了一笔';
    if (safeAmount > 0) {
      addSavings(safeAmount, description);
    }
    addImpulse({
      title: description,
      amount: safeAmount,
      note: '忍住了，没买',
    });
    setShowHoldConfirm(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            className="relative w-full max-w-md bg-white rounded-t-3xl shadow-2xl max-h-[85vh] overflow-y-auto"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">想买点什么？</h2>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200"
              >
                ✕
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="比如：一杯奶茶 ¥28，刚发工资想犒劳自己"
                  className="w-full h-24 px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none resize-none text-gray-800"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => setInput(prompt)}
                    className="px-3 py-1.5 rounded-full bg-gray-100 text-sm text-gray-600 hover:bg-gray-200"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              <button
                onClick={handleAnalyze}
                disabled={!input.trim() || loading}
                className="w-full py-3 rounded-xl bg-indigo-600 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-700 transition"
              >
                {loading ? '思考中…' : '问问 Kura'}
              </button>

              {/* 忍住：即时决定，不调 AI，直接弹确认框存进许愿池 */}
              <button
                onClick={handleHoldClick}
                disabled={!input.trim()}
                className="w-full py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-amber-100 transition"
              >
                忍住，先忍忍 🧘
              </button>

              <AnimatePresence>
                {advice && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-3"
                  >
                    <div
                      className={`rounded-xl p-4 ${
                        advice.verdict === 'buy'
                          ? 'bg-green-50 border border-green-200'
                          : advice.verdict === 'avoid'
                          ? 'bg-red-50 border border-red-200'
                          : 'bg-amber-50 border border-amber-200'
                      }`}
                    >
                      <div className="font-semibold text-gray-900 mb-1">
                        {advice.title}
                      </div>
                      <div className="text-sm text-gray-600">{advice.reason}</div>
                      {advice.suggestion && (
                        <div className="mt-2 text-sm text-gray-500 italic">
                          {advice.suggestion}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSaveToWishlist(advice.verdict)}
                        className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
                      >
                        存进清单
                      </button>
                      <button
                        onClick={onClose}
                        className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-sm font-medium hover:bg-gray-200"
                      >
                        关掉
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* 忍住确认框：忍住了多少钱？ */}
            <AnimatePresence>
              {showHoldConfirm && (
                <motion.div
                  className="absolute inset-0 z-10 flex items-center justify-center p-5"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div
                    className="absolute inset-0 bg-black/30"
                    onClick={() => setShowHoldConfirm(false)}
                  />
                  <motion.div
                    className="relative w-full max-w-xs bg-white rounded-2xl shadow-xl p-5 space-y-4"
                    initial={{ scale: 0.92, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.92, opacity: 0 }}
                  >
                    <div className="text-base font-semibold text-gray-900">
                      忍住了多少钱？
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        autoFocus
                        value={holdAmount}
                        onChange={(e) => setHoldAmount(e.target.value)}
                        placeholder="0"
                        className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none text-gray-800 text-lg"
                      />
                      <span className="text-gray-500">元</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowHoldConfirm(false)}
                        className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-sm font-medium hover:bg-gray-200"
                      >
                        取消
                      </button>
                      <button
                        onClick={handleConfirmHold}
                        className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-medium hover:bg-amber-600"
                      >
                        存进许愿池 ✓
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 保存提示 */}
            <AnimatePresence>
              {showSavedToast && (
                <motion.div
                  className="absolute inset-x-0 bottom-6 flex justify-center"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                >
                  <div className="px-4 py-2 rounded-full bg-gray-900 text-white text-sm shadow-lg">
                    已存进清单 ✓
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
