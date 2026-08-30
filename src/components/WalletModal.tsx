import React, { useState, useRef, useEffect } from 'react';
import { UserProfile, WalletTransaction } from '../types';
import { JAZZCASH_ACCOUNT_DETAILS, EASYPAISA_ACCOUNT_DETAILS } from '../data/initialData';
import { X, Wallet, ArrowDownLeft, ArrowUpRight, Copy, Check, Clock, ShieldCheck, AlertCircle, AlertTriangle, ArrowLeft, Upload, CheckCircle2, XCircle, Image as ImageIcon, Trash2, RefreshCw } from 'lucide-react';
import { useSmartLoading } from '../context/LoadingContext';
import { parseAmount } from '../lib/supabase';

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile | null;
  transactions: WalletTransaction[];
  isLoadingTransactions?: boolean;
  onRefreshTransactions?: () => Promise<void> | void;
  onSubmitDeposit: (
    method: 'JazzCash' | 'EasyPaisa',
    amount: number,
    trxId: string,
    senderName: string,
    screenshotUrl?: string
  ) => Promise<any> | any;
  onSubmitWithdrawal: (
    method: 'JazzCash' | 'EasyPaisa' | 'SadaPay' | 'NayaPay',
    amount: number,
    accountNumber: string,
    accountTitle: string,
    screenshotUrl?: string
  ) => Promise<any> | any;
}

export const WalletModal: React.FC<WalletModalProps> = ({
  isOpen,
  onClose,
  userProfile,
  transactions,
  isLoadingTransactions = false,
  onRefreshTransactions,
  onSubmitDeposit,
  onSubmitWithdrawal
}) => {
  const { executeTask, isTaskLoading } = useSmartLoading();
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw' | 'history'>('deposit');

  useEffect(() => {
    if (isOpen && onRefreshTransactions) {
      onRefreshTransactions();
    }
    // Auto-sync / clear form fields when modal opens or when user profile changes
    const currentName = userProfile?.name || userProfile?.username || '';
    setSenderName(currentName);
    setWithdrawAccountTitle(currentName);
    setTrxId('');
    setDepositScreenshot('');
    setWithdrawAccountNum('');
    setWithdrawScreenshot('');
    setDepositSuccessMsg(false);
    setDepositErrorMsg(null);
    setWithdrawSuccessMsg(false);
    setWithdrawErrorMsg(null);
    setIsSubmittingDeposit(false);
    depositSubmittingRef.current = false;
    setIsSubmittingWithdraw(false);
    withdrawSubmittingRef.current = false;
  }, [isOpen, userProfile?.id, userProfile?.name, userProfile?.username]);
  
  // Deposit Form state
  const [depositMethod, setDepositMethod] = useState<'JazzCash' | 'EasyPaisa'>('JazzCash');
  const [depositAmount, setDepositAmount] = useState<number | string>(200);
  const [trxId, setTrxId] = useState<string>('');
  const [senderName, setSenderName] = useState<string>(userProfile?.name || userProfile?.username || '');
  const [depositScreenshot, setDepositScreenshot] = useState<string>('');
  const [depositSuccessMsg, setDepositSuccessMsg] = useState<boolean>(false);
  const [depositErrorMsg, setDepositErrorMsg] = useState<string | null>(null);
  const [isSubmittingDeposit, setIsSubmittingDeposit] = useState<boolean>(false);
  const depositSubmittingRef = useRef<boolean>(false);

  // Withdrawal Form state
  const [withdrawMethod, setWithdrawMethod] = useState<'JazzCash' | 'EasyPaisa' | 'SadaPay' | 'NayaPay'>('JazzCash');
  const [withdrawAmount, setWithdrawAmount] = useState<number | string>(300);
  const [withdrawAccountNum, setWithdrawAccountNum] = useState<string>('');
  const [withdrawAccountTitle, setWithdrawAccountTitle] = useState<string>('');
  const [withdrawScreenshot, setWithdrawScreenshot] = useState<string>('');
  const [withdrawSuccessMsg, setWithdrawSuccessMsg] = useState<boolean>(false);
  const [withdrawErrorMsg, setWithdrawErrorMsg] = useState<string | null>(null);
  const [isSubmittingWithdraw, setIsSubmittingWithdraw] = useState<boolean>(false);
  const withdrawSubmittingRef = useRef<boolean>(false);

  // Helper change handlers for Amount Fields (Min 100, Max 100000, numbers only, clamp to 100000)
  const handleDepositAmountChange = (val: string) => {
    setDepositAmount(val);
    const amt = parseAmount(val);
    if (amt === null) {
      setDepositErrorMsg(null);
      return;
    }
    if (amt > 100000) {
      setDepositAmount('100000');
      setDepositErrorMsg('Maximum amount is 100000');
    } else if (amt < 100) {
      setDepositErrorMsg('Minimum amount is 100');
    } else {
      setDepositErrorMsg(null);
    }
  };

  const handleWithdrawAmountChange = (val: string) => {
    setWithdrawAmount(val);
    const amt = parseAmount(val);
    if (amt === null) {
      setWithdrawErrorMsg(null);
      return;
    }
    if (amt > 100000) {
      setWithdrawAmount('100000');
      setWithdrawErrorMsg('Maximum amount is 100000');
    } else if (amt < 100) {
      setWithdrawErrorMsg('Minimum amount is 100');
    } else {
      setWithdrawErrorMsg(null);
    }
  };

  // 5-minute Cooldown State (300,000ms)
  const COOLDOWN_MS = 5 * 60 * 1000;
  const [lastDepositTime, setLastDepositTime] = useState<number>(0);
  const [lastWithdrawTime, setLastWithdrawTime] = useState<number>(0);
  const [depositCooldown, setDepositCooldown] = useState<number>(0);
  const [withdrawCooldown, setWithdrawCooldown] = useState<number>(0);

  useEffect(() => {
    const updateCooldowns = () => {
      const now = Date.now();
      if (lastDepositTime > 0) {
        const elapsed = now - lastDepositTime;
        const remaining = Math.max(0, Math.ceil((COOLDOWN_MS - elapsed) / 1000));
        setDepositCooldown(remaining);
      } else {
        setDepositCooldown(0);
      }

      if (lastWithdrawTime > 0) {
        const elapsed = now - lastWithdrawTime;
        const remaining = Math.max(0, Math.ceil((COOLDOWN_MS - elapsed) / 1000));
        setWithdrawCooldown(remaining);
      } else {
        setWithdrawCooldown(0);
      }
    };

    updateCooldowns();
    const timer = setInterval(updateCooldowns, 1000);
    return () => clearInterval(timer);
  }, [lastDepositTime, lastWithdrawTime]);

  const [copiedNum, setCopiedNum] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleCopyNum = (num: string) => {
    navigator.clipboard.writeText(num);
    setCopiedNum(true);
    setTimeout(() => setCopiedNum(false), 2000);
  };

  // Convert uploaded screenshot to a small, safe Base64 image
  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setTarget: (val: string) => void
  ) => {
    const file = e.target.files?.[0];

    // Remove focus from the file input to prevent unwanted mobile auto-scroll
    e.currentTarget.blur();

    if (!file) {
      return;
    }

    // Only allow image files
    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file.');
      e.currentTarget.value = '';
      return;
    }

    // Prevent very large files from crashing the mobile browser
    if (file.size > 5 * 1024 * 1024) {
      alert('Image is too large. Please select an image smaller than 5MB.');
      e.currentTarget.value = '';
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      e.currentTarget.value = '';
    };

    img.onload = () => {
      try {
        const maxWidth = 900;

        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (!width || !height) {
          throw new Error('Unable to read image dimensions.');
        }

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');

        if (!ctx) {
          throw new Error('Unable to create image canvas.');
        }

        ctx.drawImage(img, 0, 0, width, height);

        const base64Str = canvas.toDataURL('image/jpeg', 0.65);

        if (!base64Str || base64Str === 'data:,') {
          throw new Error('Unable to process image.');
        }

        setTarget(base64Str);
      } catch (error) {
        console.error('Screenshot processing error:', error);
        alert('This image could not be processed. Please select a JPG or PNG screenshot.');
      } finally {
        cleanup();
      }
    };

    img.onerror = () => {
      console.error('Unable to load selected image.');
      alert('This image format is not supported. Please select a JPG or PNG screenshot.');
      cleanup();
    };

    img.src = objectUrl;
  };

  const handleDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (depositSubmittingRef.current || isSubmittingDeposit) {
      console.log("Deposit submit blocked: already submitting");
      return;
    }

    if (depositCooldown > 0) {
      const mins = Math.floor(depositCooldown / 60);
      const secs = depositCooldown % 60;
      alert(`Cooldown Active: Please wait ${mins}m ${secs}s before submitting another deposit request.`);
      return;
    }

    depositSubmittingRef.current = true;
    setIsSubmittingDeposit(true);
    setDepositErrorMsg(null);

    const effectiveSender = (senderName || userProfile?.name || userProfile?.username || 'Player').trim();
    const effectiveAmount = parseAmount(depositAmount);
    const effectiveTrxId = (trxId || '').trim();

    if (effectiveAmount === null || effectiveAmount < 100 || effectiveAmount > 100000) {
      setDepositErrorMsg(effectiveAmount === null ? 'Minimum amount is 100' : effectiveAmount < 100 ? 'Minimum amount is 100' : 'Maximum amount is 100000');
      depositSubmittingRef.current = false;
      setIsSubmittingDeposit(false);
      return;
    }
    if (!effectiveTrxId) {
      alert('Please enter your JazzCash / EasyPaisa Transaction TRX ID.');
      depositSubmittingRef.current = false;
      setIsSubmittingDeposit(false);
      return;
    }
    if (!depositScreenshot) {
      setDepositErrorMsg('Upload first payment screenshot for payment proof');
      depositSubmittingRef.current = false;
      setIsSubmittingDeposit(false);
      return;
    }

    try {
      await executeTask('deposit_submit', async () => {
        await onSubmitDeposit(depositMethod, effectiveAmount, effectiveTrxId, effectiveSender, depositScreenshot || '');

        setDepositSuccessMsg(true);
        setDepositErrorMsg(null);

        // Record successful deposit timestamp for 5-minute cooldown
        const now = Date.now();
        setLastDepositTime(now);

        if (onRefreshTransactions) {
          onRefreshTransactions();
        }
      }, { isGlobal: true, globalMessage: 'Submitting Deposit Request...' });
    } catch (err: any) {
      console.error('Deposit submission error:', err);
      const errMsg = err?.message || 'Deposit submission failed. Please try again.';
      setDepositErrorMsg(errMsg);
      setDepositSuccessMsg(false);
    } finally {
      depositSubmittingRef.current = false;
      setIsSubmittingDeposit(false);
    }
  };

  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (withdrawSubmittingRef.current || isSubmittingWithdraw) {
      console.log("Withdraw submit blocked: already submitting");
      return;
    }

    if (withdrawCooldown > 0) {
      const mins = Math.floor(withdrawCooldown / 60);
      const secs = withdrawCooldown % 60;
      alert(`Cooldown Active: Please wait ${mins}m ${secs}s before submitting another withdrawal request.`);
      return;
    }

    withdrawSubmittingRef.current = true;
    setIsSubmittingWithdraw(true);
    setWithdrawErrorMsg(null);

    const currentBalance = parseAmount(userProfile?.wallet_balance) ?? 0;
    const effectiveAmount = parseAmount(withdrawAmount);

    if (effectiveAmount === null || effectiveAmount < 100 || effectiveAmount > 100000) {
      setWithdrawErrorMsg(effectiveAmount === null ? 'Minimum amount is 100' : effectiveAmount < 100 ? 'Minimum amount is 100' : 'Maximum amount is 100000');
      withdrawSubmittingRef.current = false;
      setIsSubmittingWithdraw(false);
      return;
    }

    // 1. BALANCE CHECK BEFORE WITHDRAWAL
    if (effectiveAmount > currentBalance) {
      setWithdrawErrorMsg("Insufficient Balance: You do not have enough funds in your wallet to complete this withdrawal.");
      withdrawSubmittingRef.current = false;
      setIsSubmittingWithdraw(false);
      return;
    }

    // Strict 11-digit Pakistani phone number check
    const digitsOnly = withdrawAccountNum.replace(/\D/g, '');
    if (digitsOnly.length !== 11) {
      setWithdrawErrorMsg("Account Number must be an 11-digit Pakistani mobile phone number (e.g., 03021234567).");
      withdrawSubmittingRef.current = false;
      setIsSubmittingWithdraw(false);
      return;
    }

    if (!withdrawAccountTitle.trim()) {
      setWithdrawErrorMsg("Please enter receiving Account Title Name.");
      withdrawSubmittingRef.current = false;
      setIsSubmittingWithdraw(false);
      return;
    }

    if (!withdrawScreenshot) {
      setWithdrawErrorMsg("Profile Balance Screenshot is required. Please upload a screenshot showing your current balance.");
      withdrawSubmittingRef.current = false;
      setIsSubmittingWithdraw(false);
      return;
    }

    const withdrawalPayload = {
      player_id: userProfile?.id,
      username: userProfile?.username || '',
      payment_method: withdrawMethod,
      amount: effectiveAmount,
      account_number: digitsOnly,
      account_title: withdrawAccountTitle.trim(),
      screenshot_url: withdrawScreenshot ? 'ATTACHED' : 'NONE'
    };
    console.log('[WalletModal handleWithdrawSubmit] Sending withdrawal payload:', withdrawalPayload);

    try {
      await executeTask('withdrawal_submit', async () => {
        await onSubmitWithdrawal(withdrawMethod, effectiveAmount, digitsOnly, withdrawAccountTitle.trim(), withdrawScreenshot);

        setWithdrawSuccessMsg(true);

        // Record successful withdrawal timestamp for 5-minute cooldown
        const now = Date.now();
        setLastWithdrawTime(now);

        if (onRefreshTransactions) {
          onRefreshTransactions();
        }
      }, { isGlobal: true, globalMessage: 'Submitting Withdrawal Request...' });
    } catch (err: any) {
      console.error('Withdrawal submission error:', err);
      const errMsg = err?.message || "Withdrawal failed. Please check your connection or balance and try again.";
      setWithdrawErrorMsg(errMsg);
      setWithdrawSuccessMsg(false);
    } finally {
      withdrawSubmittingRef.current = false;
      setIsSubmittingWithdraw(false);
    }
  };

  const resetDepositForm = () => {
    const currentName = userProfile?.name || userProfile?.username || '';
    setSenderName(currentName);
    setTrxId('');
    setDepositScreenshot('');
    setDepositSuccessMsg(false);
    setDepositErrorMsg(null);
    if (onRefreshTransactions) {
      onRefreshTransactions();
    }
  };

  const resetWithdrawForm = () => {
    const currentName = userProfile?.name || userProfile?.username || '';
    setWithdrawAccountTitle(currentName);
    setWithdrawAccountNum('');
    setWithdrawScreenshot('');
    setWithdrawSuccessMsg(false);
    setWithdrawErrorMsg(null);
    if (onRefreshTransactions) {
      onRefreshTransactions();
    }
  };

  return (
    <div className="fixed inset-0 w-full h-full min-h-screen z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-0 md:p-4 lg:p-6 overflow-hidden animate-in fade-in duration-200">
      <div className="w-full h-full md:h-auto md:max-h-[92vh] md:rounded-2xl max-w-2xl lg:max-w-3xl mx-auto flex flex-col overflow-hidden border border-[#00e5ff]/20 relative bg-[#040e1a] shadow-2xl">
        
        {/* Header Bar */}
        <div className="p-4 bg-gradient-to-r from-[#07192e] via-[#030a16] to-[#07192e] border-b border-[#00e5ff]/20 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-[#07192e] border border-[#00e5ff]/40 text-[#00e5ff] hover:bg-[#00e5ff]/20 active:scale-95 transition-all shadow-inner"
              title="Return to Arena"
            >
              <ArrowLeft className="w-5 h-5 text-[#00e5ff]" />
            </button>
            <div className="p-2 rounded-xl bg-[#00e5ff]/10 border border-[#00e5ff]/40 text-[#00e5ff]">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold text-[#00e5ff] tracking-widest uppercase">
                CASH WALLET
              </span>
              <h2 className="text-base font-black text-white">
                RS. {(userProfile?.wallet_balance || 0).toLocaleString()} <span className="text-xs text-gray-400 font-normal">PKR</span>
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-gray-800/80 text-gray-400 hover:text-white hover:bg-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3 Main Tab Options */}
        <div className="flex border-b border-gray-800 bg-[#020710]">
          <button
            onClick={() => {
              setActiveTab('deposit');
              setDepositSuccessMsg(false);
            }}
            className={`flex-1 py-3 text-xs font-extrabold transition-all border-b-2 flex items-center justify-center gap-1.5 ${
              activeTab === 'deposit'
                ? 'border-[#00e5ff] text-[#00e5ff] bg-[#00e5ff]/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <ArrowDownLeft className="w-4 h-4" />
            Deposit Funds
          </button>
          <button
            onClick={() => {
              setActiveTab('withdraw');
              setWithdrawSuccessMsg(false);
            }}
            className={`flex-1 py-3 text-xs font-extrabold transition-all border-b-2 flex items-center justify-center gap-1.5 ${
              activeTab === 'withdraw'
                ? 'border-[#00e5ff] text-[#00e5ff] bg-[#00e5ff]/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <ArrowUpRight className="w-4 h-4" />
            Withdraw Funds
          </button>
          <button
            onClick={() => {
              setActiveTab('history');
              if (onRefreshTransactions) onRefreshTransactions();
            }}
            className={`flex-1 py-3 text-xs font-extrabold transition-all border-b-2 flex items-center justify-center gap-1.5 ${
              activeTab === 'history'
                ? 'border-[#00e5ff] text-[#00e5ff] bg-[#00e5ff]/10'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Clock className="w-4 h-4" />
            Transaction History ({transactions.length})
          </button>
        </div>

        {/* Body Content */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          
          {/* TAB 1: DEPOSIT */}
          {activeTab === 'deposit' && (
            <div className="space-y-4">
              {depositSuccessMsg ? (
                /* Green Success Card for Deposit Submission */
                <div className="p-6 rounded-2xl bg-gradient-to-b from-emerald-950/40 to-[#020710] border border-emerald-500/30 text-center space-y-5 shadow-xl animate-in fade-in zoom-in-95 duration-250 ease-out flex flex-col justify-center items-center min-h-[380px] w-full">
                  <div className="relative">
                    <div className="absolute -inset-3 rounded-full bg-emerald-500/10 blur-md animate-pulse" />
                    <div className="w-16 h-16 rounded-full bg-gradient-to-b from-emerald-500/20 to-emerald-500/5 border border-emerald-400/60 text-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/10 relative z-10">
                      <CheckCircle2 className="w-9 h-9" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-xl font-black text-white tracking-tight">Deposit Request Submitted!</h3>
                    <p className="text-xs text-gray-400 max-w-sm mx-auto">Your request has been successfully sent to the MVP Esports administrator team.</p>
                  </div>

                  <div className="w-full max-w-sm bg-[#07192e]/40 border border-emerald-500/20 rounded-xl p-4 space-y-2.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-400 font-bold uppercase tracking-wider">Amount Submitted</span>
                      <span className="font-black text-emerald-400">Rs. {depositAmount}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-400 font-bold uppercase tracking-wider">Payment Method</span>
                      <span className="font-black text-white">{depositMethod}</span>
                    </div>
                    <p className="text-[11px] text-emerald-300 font-semibold leading-relaxed bg-emerald-950/60 p-2.5 rounded-lg border border-emerald-500/20 text-center w-full">
                      Request Submitted Successfully to Admin. Funds will be credited within 24 hours.
                    </p>
                  </div>

                  <div className="pt-2 flex gap-3 w-full max-w-sm">
                    <button
                      onClick={resetDepositForm}
                      className="flex-1 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 font-bold text-xs active:scale-95 transition-all border border-gray-700"
                    >
                      New Deposit
                    </button>
                    <button
                      onClick={() => {
                        resetDepositForm();
                        setActiveTab('history');
                      }}
                      className="flex-1 py-3 rounded-xl bg-[#00e5ff] hover:brightness-110 text-[#030a16] font-black text-xs active:scale-95 transition-all"
                    >
                      View History
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {depositErrorMsg && (
                    <div className="p-3 rounded-xl bg-red-900/60 border border-red-500/50 text-red-200 text-xs font-semibold flex items-center gap-2 mb-3">
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                      <span>{depositErrorMsg}</span>
                    </div>
                  )}

                  {/* Payment Method Selector */}
                  <div>
                    <label className="text-xs font-extrabold text-gray-300 block mb-2 uppercase tracking-wide">
                      Select Deposit Method
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setDepositMethod('JazzCash')}
                        className={`p-3 rounded-xl border flex items-center justify-center gap-2 font-black text-xs transition-all ${
                          depositMethod === 'JazzCash'
                            ? 'bg-gradient-to-r from-red-600/30 to-amber-600/30 border-amber-400 text-white shadow-md'
                            : 'bg-[#07192e] border-gray-800 text-gray-400 hover:text-white'
                        }`}
                      >
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                        JazzCash
                      </button>

                      <button
                        type="button"
                        onClick={() => setDepositMethod('EasyPaisa')}
                        className={`p-3 rounded-xl border flex items-center justify-center gap-2 font-black text-xs transition-all ${
                          depositMethod === 'EasyPaisa'
                            ? 'bg-gradient-to-r from-emerald-600/30 to-green-600/30 border-emerald-400 text-white shadow-md'
                            : 'bg-[#07192e] border-gray-800 text-gray-400 hover:text-white'
                        }`}
                      >
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                        EasyPaisa
                      </button>
                    </div>
                  </div>

                  {/* Account Details Box */}
                  {(() => {
                    const activeAccount = depositMethod === 'JazzCash' ? JAZZCASH_ACCOUNT_DETAILS : EASYPAISA_ACCOUNT_DETAILS;
                    const cleanNum = activeAccount.accountNumber.replace(/\s+/g, '');
                    return (
                      <div className="p-3.5 rounded-xl bg-gradient-to-br from-[#07192e] to-[#020710] border border-[#00e5ff]/30 text-xs space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] text-[#00e5ff] font-extrabold tracking-widest uppercase">
                            STEP 1: SEND MONEY TO THIS ACCOUNT
                          </span>
                          <span className="text-[10px] text-gray-400 font-bold">{depositMethod}</span>
                        </div>

                        <div className="p-2.5 rounded-lg bg-[#030a16] border border-gray-800 flex justify-between items-center">
                          <div>
                            <p className="text-[10px] text-gray-400 font-medium">OFFICIAL ACCOUNT NUMBER</p>
                            <p className="text-base font-black text-white tracking-wider">{activeAccount.accountNumber}</p>
                            <p className="text-[10px] text-emerald-400 font-semibold">Title: {activeAccount.accountTitle}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopyNum(cleanNum)}
                            className="px-3 py-1.5 rounded-lg bg-[#00e5ff]/20 text-[#00e5ff] hover:bg-[#00e5ff]/30 text-xs font-bold flex items-center gap-1 border border-[#00e5ff]/40 active:scale-95 transition-all"
                          >
                            {copiedNum ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            {copiedNum ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Step 2 Deposit Form */}
                  <form onSubmit={handleDepositSubmit} className="space-y-3 pt-1">
                    <div className="text-[10px] font-extrabold text-[#00e5ff] tracking-widest uppercase">
                      STEP 2: ENTER TRANSACTION DETAILS
                    </div>

                    {/* Sender Name */}
                    <div>
                      <label className="text-[11px] font-bold text-gray-300 block mb-1">
                        1. Sender Name / Account Holder Name *
                      </label>
                      <input
                        type="text"
                        placeholder="Full Name as registered on account"
                        value={senderName}
                        onChange={(e) => setSenderName(e.target.value)}
                        className="w-full p-2.5 rounded-lg bg-[#07192e] border border-gray-700 text-white text-xs focus:outline-none focus:border-[#00e5ff]"
                        required
                      />
                    </div>

                    {/* Deposit Amount */}
                    <div>
                      <label className="text-[11px] font-bold text-gray-300 block mb-1">
                        2. Deposit Amount (PKR RS.) *
                      </label>
                      <div className="flex gap-2 mb-2">
                        {[100, 200, 500, 1000, 2000].map((amt) => (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => {
                              setDepositAmount(amt);
                              if (depositErrorMsg === 'Maximum amount is 100000') {
                                setDepositErrorMsg(null);
                              }
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                              Number(depositAmount) === amt
                                ? 'bg-[#00e5ff] text-[#030a16] border-[#00e5ff]'
                                : 'bg-[#07192e] text-gray-300 border-gray-700 hover:border-gray-500'
                            }`}
                          >
                            RS. {amt}
                          </button>
                        ))}
                      </div>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={depositAmount}
                        onChange={(e) => handleDepositAmountChange(e.target.value)}
                        placeholder="Min RS. 100, Max RS. 100,000"
                        className="w-full p-2.5 rounded-lg bg-[#07192e] border border-gray-700 text-white text-xs focus:outline-none focus:border-[#00e5ff]"
                        required
                      />
                      {depositErrorMsg && (depositErrorMsg === 'Maximum amount is 100000' || depositErrorMsg === 'Minimum amount is 100') && (
                        <p className="text-[11px] font-extrabold text-red-400 mt-1 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                          {depositErrorMsg}
                        </p>
                      )}
                    </div>

                    {/* Trx ID */}
                    <div>
                      <label className="text-[11px] font-bold text-gray-300 block mb-1">
                        3. Transaction TRX ID / TID (SMS confirmation code) *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 0293849201 or JC99201"
                        value={trxId}
                        onChange={(e) => setTrxId(e.target.value)}
                        className="w-full p-2.5 rounded-lg bg-[#07192e] border border-gray-700 text-white text-xs focus:outline-none focus:border-[#00e5ff]"
                        required
                      />
                    </div>

                    {/* Payment Screenshot Upload */}
                    <div>
                      <label className="text-[11px] font-bold text-gray-300 block mb-1">
                        4. Upload Payment Screenshot Receipt *
                      </label>
                      {depositScreenshot ? (
                        <div className="relative p-2 rounded-xl bg-[#030a16] border border-[#00e5ff]/40 flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <img
                              src={depositScreenshot}
                              alt="Deposit Screenshot"
                              className="w-12 h-12 object-cover rounded-lg border border-gray-700"
                            />
                            <div className="min-w-0">
                              <span className="text-xs font-bold text-emerald-400 block truncate">Screenshot Uploaded ✓</span>
                              <span className="text-[10px] text-gray-400 block">Click trash to replace</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setDepositScreenshot('')}
                            className="p-2 text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <label className="p-4 rounded-xl border-2 border-dashed border-gray-700 hover:border-[#00e5ff]/60 bg-[#07192e]/50 flex flex-col items-center justify-center cursor-pointer transition-all">
                          <Upload className="w-6 h-6 text-[#00e5ff] mb-1" />
                          <span className="text-xs font-bold text-gray-300">Click to Select Payment Screenshot</span>
                          <span className="text-[10px] text-gray-500">PNG, JPG or JPEG (Max 5MB)</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleFileUpload(e, setDepositScreenshot)}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmittingDeposit || isTaskLoading('deposit_submit') || depositCooldown > 0}
                      className={`w-full py-3.5 rounded-xl font-black text-xs tracking-wider shadow-lg flex items-center justify-center gap-2 transition-all mt-2 uppercase ${
                        isSubmittingDeposit || isTaskLoading('deposit_submit') || depositCooldown > 0
                          ? 'bg-gray-700 text-gray-400 cursor-not-allowed shadow-none'
                          : 'bg-gradient-to-r from-[#00e5ff] to-[#0088ff] text-[#030a16] shadow-[#00e5ff]/20 hover:brightness-110 active:scale-95'
                      }`}
                    >
                      {isSubmittingDeposit || isTaskLoading('deposit_submit') ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Processing...
                        </>
                      ) : depositCooldown > 0 ? (
                        `Cooldown (${Math.floor(depositCooldown / 60)}m ${depositCooldown % 60}s)`
                      ) : (
                        'Deposit Now'
                      )}
                    </button>
                  </form>
                </>
              )}
            </div>
          )}

          {/* TAB 2: WITHDRAW */}
          {activeTab === 'withdraw' && (
            <div className="space-y-4">
              {withdrawSuccessMsg ? (
                /* Green Success Card for Withdrawal Submission */
                <div className="p-6 rounded-2xl bg-gradient-to-b from-emerald-950/40 to-[#020710] border border-emerald-500/30 text-center space-y-5 shadow-xl animate-in fade-in zoom-in-95 duration-250 ease-out flex flex-col justify-center items-center min-h-[380px] w-full">
                  <div className="relative">
                    <div className="absolute -inset-3 rounded-full bg-emerald-500/10 blur-md animate-pulse" />
                    <div className="w-16 h-16 rounded-full bg-gradient-to-b from-emerald-500/20 to-emerald-500/5 border-2 border-emerald-400/60 text-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/10 relative z-10">
                      <CheckCircle2 className="w-9 h-9" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-xl font-black text-white tracking-tight">Withdrawal Request Submitted!</h3>
                    <p className="text-xs text-gray-400 max-w-sm mx-auto">Your request has been successfully sent to the MVP Esports administrator team.</p>
                  </div>

                  <div className="w-full max-w-sm bg-[#07192e]/40 border border-emerald-500/20 rounded-xl p-4 space-y-2.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-400 font-bold uppercase tracking-wider">Amount Requested</span>
                      <span className="font-black text-emerald-400">Rs. {withdrawAmount}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-400 font-bold uppercase tracking-wider">Receiving Method</span>
                      <span className="font-black text-white">{withdrawMethod}</span>
                    </div>
                    <p className="text-[11px] text-emerald-300 font-semibold leading-relaxed bg-emerald-950/60 p-2.5 rounded-lg border border-emerald-500/20 text-center w-full">
                      Withdrawal Request Submitted. Processing time up to 24 hours.
                    </p>
                  </div>

                  <div className="pt-2 flex gap-3 w-full max-w-sm">
                    <button
                      onClick={resetWithdrawForm}
                      className="flex-1 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 font-bold text-xs active:scale-95 transition-all border border-gray-700"
                    >
                      New Request
                    </button>
                    <button
                      onClick={() => {
                        resetWithdrawForm();
                        setActiveTab('history');
                      }}
                      className="flex-1 py-3 rounded-xl bg-[#00e5ff] hover:brightness-110 text-[#030a16] font-black text-xs active:scale-95 transition-all"
                    >
                      View History
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleWithdrawSubmit} className="space-y-3">
                  {/* Insufficient Balance / Validation Red Error Notification Card */}
                  {withdrawErrorMsg && (
                    <div className="p-3.5 rounded-xl bg-red-950/90 border border-red-500/80 text-red-100 text-xs flex items-start gap-2.5 shadow-xl animate-in fade-in slide-in-from-top-2 duration-200">
                      <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-extrabold text-red-300 uppercase tracking-wide text-[10px]">Withdrawal Blocked</p>
                        <p className="text-xs font-bold text-white mt-0.5 leading-snug">{withdrawErrorMsg}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setWithdrawErrorMsg(null)}
                        className="text-red-400 hover:text-white p-1 rounded-lg hover:bg-red-900/50"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  <div className="p-3 rounded-xl bg-[#07192e] border border-[#00e5ff]/30 flex justify-between items-center text-xs">
                    <div>
                      <span className="text-gray-400 text-[10px] block font-medium">Available Winnings Balance</span>
                      <span className="text-base font-black text-[#00e5ff]">
                        RS. {(userProfile?.wallet_balance || 0).toLocaleString()}
                      </span>
                    </div>
                    <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/30">
                      Auto Balance Hold
                    </span>
                  </div>

                  {/* Payment Method (4 Options) */}
                  <div>
                    <label className="text-xs font-bold text-gray-300 block mb-1">Select Payout Method *</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(['JazzCash', 'EasyPaisa', 'SadaPay', 'NayaPay'] as const).map((method) => (
                        <button
                          key={method}
                          type="button"
                          onClick={() => setWithdrawMethod(method)}
                          className={`p-2.5 rounded-xl border font-black text-xs transition-all ${
                            withdrawMethod === method
                              ? 'bg-[#00e5ff]/20 border-[#00e5ff] text-[#00e5ff] shadow-md'
                              : 'bg-[#07192e] border-gray-800 text-gray-400 hover:text-white'
                          }`}
                        >
                          {method}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 1. Account Mobile Number (11 digits check) */}
                  <div>
                    <label className="text-[11px] font-bold text-gray-300 block mb-1">
                      1. Account Number (Strict 11-digit Phone Number) *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 03001234567 (11 digits)"
                      value={withdrawAccountNum}
                      onChange={(e) => setWithdrawAccountNum(e.target.value)}
                      className="w-full p-2.5 rounded-lg bg-[#07192e] border border-gray-700 text-white text-xs focus:outline-none focus:border-[#00e5ff]"
                      required
                      maxLength={11}
                    />
                    <span className="text-[10px] text-gray-400 mt-0.5 block">Must be exactly 11 numeric digits</span>
                  </div>

                  {/* 2. Receiver Account Name */}
                  <div>
                    <label className="text-[11px] font-bold text-gray-300 block mb-1">
                      2. Receiver Account Name (Title) *
                    </label>
                    <input
                      type="text"
                      placeholder="Account Title Name"
                      value={withdrawAccountTitle}
                      onChange={(e) => setWithdrawAccountTitle(e.target.value)}
                      className="w-full p-2.5 rounded-lg bg-[#07192e] border border-gray-700 text-white text-xs focus:outline-none focus:border-[#00e5ff]"
                      required
                    />
                  </div>

                  {/* 3. Withdrawal Amount */}
                  <div>
                    <label className="text-[11px] font-bold text-gray-300 block mb-1">
                      3. Withdrawal Amount (RS.) *
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="Min RS. 100, Max RS. 100,000"
                      value={withdrawAmount}
                      onChange={(e) => handleWithdrawAmountChange(e.target.value)}
                      className="w-full p-2.5 rounded-lg bg-[#07192e] border border-gray-700 text-white text-xs focus:outline-none focus:border-[#00e5ff]"
                      required
                    />
                    {withdrawErrorMsg && (withdrawErrorMsg === 'Maximum amount is 100000' || withdrawErrorMsg === 'Minimum amount is 100') && (
                      <p className="text-[11px] font-extrabold text-red-400 mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                        {withdrawErrorMsg}
                      </p>
                    )}
                  </div>

                  {/* 4. Profile Balance Screenshot Upload */}
                  <div>
                    <label className="text-[11px] font-bold text-gray-300 block mb-1">
                      4. Upload Profile Balance Screenshot *
                    </label>
                    {withdrawScreenshot ? (
                      <div className="relative p-2 rounded-xl bg-[#030a16] border border-[#00e5ff]/40 flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <img
                            src={withdrawScreenshot}
                            alt="Profile Balance Screenshot"
                            className="w-12 h-12 object-cover rounded-lg border border-gray-700"
                          />
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-emerald-400 block truncate">Balance Screenshot Attached ✓</span>
                            <span className="text-[10px] text-gray-400 block">Click trash to replace</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setWithdrawScreenshot('')}
                          className="p-2 text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <label className="p-4 rounded-xl border-2 border-dashed border-gray-700 hover:border-[#00e5ff]/60 bg-[#07192e]/50 flex flex-col items-center justify-center cursor-pointer transition-all">
                        <Upload className="w-6 h-6 text-[#00e5ff] mb-1" />
                        <span className="text-xs font-bold text-gray-300">Upload Profile Balance Screenshot</span>
                        <span className="text-[10px] text-gray-500">Attach screenshot of in-app profile balance</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleFileUpload(e, setWithdrawScreenshot)}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingWithdraw || isTaskLoading('withdrawal_submit') || withdrawCooldown > 0}
                    className={`w-full py-3.5 rounded-xl font-black text-xs tracking-wider shadow-lg flex items-center justify-center gap-2 transition-all mt-2 uppercase ${
                      isSubmittingWithdraw || isTaskLoading('withdrawal_submit') || withdrawCooldown > 0
                        ? 'bg-gray-700 text-gray-400 cursor-not-allowed shadow-none'
                        : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-[#030a16] shadow-emerald-500/20 hover:brightness-110 active:scale-95'
                    }`}
                  >
                    {isSubmittingWithdraw || isTaskLoading('withdrawal_submit') ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Processing...
                      </>
                    ) : withdrawCooldown > 0 ? (
                      `Cooldown (${Math.floor(withdrawCooldown / 60)}m ${withdrawCooldown % 60}s)`
                    ) : (
                      'Withdraw Now'
                    )}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* TAB 3: TRANSACTION HISTORY */}
          {activeTab === 'history' && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between px-1 mb-1">
                <span className="text-xs font-bold text-gray-300">Transaction History</span>
                {onRefreshTransactions && (
                  <button
                    type="button"
                    onClick={() => onRefreshTransactions()}
                    disabled={isLoadingTransactions}
                    className="flex items-center gap-1.5 text-[11px] font-bold text-[#00e5ff] hover:text-cyan-300 disabled:opacity-50 transition-colors bg-[#07192e] px-2.5 py-1 rounded-lg border border-gray-800"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoadingTransactions ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                )}
              </div>

              {(() => {
                const userTxs = userProfile
                  ? transactions.filter(t => !t.user_id || String(t.user_id) === String(userProfile.id) || String((t as any).player_id) === String(userProfile.id))
                  : transactions;

                if (isLoadingTransactions && userTxs.length === 0) {
                  return (
                    <div className="text-center py-12 bg-[#07192e]/50 rounded-2xl border border-gray-800/80 p-6 flex flex-col items-center justify-center animate-in fade-in duration-200">
                      <RefreshCw className="w-8 h-8 text-[#00e5ff] animate-spin mb-3" />
                      <p className="text-xs font-bold text-white">Loading History...</p>
                    </div>
                  );
                }

                if (userTxs.length === 0) {
                  return (
                    <div className="text-center py-8 bg-[#07192e]/50 rounded-2xl border border-gray-800 p-4">
                      <Clock className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                      <p className="text-xs font-bold text-white">No Wallet Transactions Recorded Yet</p>
                      <p className="text-[10px] text-gray-400 mt-1">Your deposits, withdrawals, and slot bookings will appear here.</p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-2">
                    {userTxs.map((tx) => (
                      <div
                        key={tx.id}
                        className="p-3 rounded-xl bg-[#07192e]/90 border border-gray-800 flex justify-between items-center text-xs space-y-1"
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`font-black capitalize ${
                              tx.type === 'deposit' || tx.type === 'match_winning' || (tx.type === 'reward_adjustment' && String(tx.payment_method || '').toLowerCase().includes('reward')) ? 'text-emerald-400' : 'text-red-400'
                            }`}>
                              {tx.type === 'deposit'
                                ? 'Deposit'
                                : tx.type === 'match_winning'
                                ? 'Match Prize'
                                : (tx.type === 'reward_adjustment' && String(tx.payment_method || '').toLowerCase().includes('reward'))
                                ? 'Reward Received'
                                : tx.type === 'reward_adjustment' && String(tx.payment_method || '').toLowerCase().includes('deduct')
                                ? 'Admin Deduction'
                                : tx.type === 'reward_adjustment'
                                ? 'Reward / Adjustment'
                                : tx.type === 'withdrawal'
                                ? 'Withdrawal'
                                : tx.type === 'match_entry'
                                ? 'Match Entry'
                                : 'Slot Booking'}
                            </span>
                            {tx.payment_method && (
                              <span className="text-[9px] bg-gray-800 text-gray-300 px-1.5 py-0.5 rounded border border-gray-700">
                                {tx.payment_method}
                              </span>
                            )}
                          </div>

                          <p className="text-[10px] text-gray-400 mt-0.5 truncate">
                            {new Date(tx.created_at).toLocaleString()} {tx.trx_id ? `| TRX: ${tx.trx_id}` : ''}
                          </p>

                          {tx.note && (
                            <p className="text-[10px] text-cyan-300 font-medium truncate mt-0.5">
                              {tx.note}
                            </p>
                          )}

                          {(tx.username || tx.user_name || tx.account_title) && (
                            <p className="text-[10px] text-gray-400 font-semibold truncate">
                              User: {tx.username || tx.user_name || tx.account_title}
                            </p>
                          )}
                        </div>

                        <div className="text-right flex-shrink-0">
                          <p className={`font-black text-sm ${
                            tx.type === 'deposit' || tx.type === 'match_winning' || (tx.type === 'reward_adjustment' && String(tx.payment_method || '').toLowerCase().includes('reward')) ? 'text-emerald-400' : 'text-red-400'
                          }`}>
                            {tx.type === 'deposit' || tx.type === 'match_winning' || (tx.type === 'reward_adjustment' && String(tx.payment_method || '').toLowerCase().includes('reward')) ? '+' : '-'} RS. {tx.amount}
                          </p>
                          {(() => {
                            const st = String(tx.status || (tx.type === 'match_entry' ? 'approved' : 'pending')).toLowerCase();
                            if (st === 'approved' || st === 'completed' || st === 'confirmed' || tx.type === 'match_entry') {
                              return (
                                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md inline-flex items-center gap-1 mt-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 tracking-wider shadow-sm">
                                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                                  APPROVED
                                </span>
                              );
                            } else if (st === 'rejected') {
                              return (
                                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md inline-flex items-center gap-1 mt-1 bg-red-500/20 text-red-300 border border-red-500/40 tracking-wider shadow-sm">
                                  <XCircle className="w-2.5 h-2.5 text-red-400" />
                                  REJECTED
                                </span>
                              );
                            } else {
                              return (
                                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md inline-flex items-center gap-1 mt-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 tracking-wider shadow-sm animate-pulse">
                                  <Clock className="w-2.5 h-2.5 text-amber-400" />
                                  {tx.type === 'withdrawal' ? 'PENDING WITHDRAWAL' : 'PENDING'}
                                </span>
                              );
                            }
                          })()}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
