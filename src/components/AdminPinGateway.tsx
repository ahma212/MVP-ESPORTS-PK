import React, { useState, useEffect, useRef } from 'react';
import { Shield, ArrowLeft, AlertCircle, Unlock, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface AdminPinGatewayProps {
  onUnlockAdmin: () => void;
  onBackToLogin: () => void;
  userProfile?: any;
}

export const AdminPinGateway: React.FC<AdminPinGatewayProps> = ({
  onUnlockAdmin,
  onBackToLogin,
  userProfile
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus the input automatically on mount
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const isAdminUser = Boolean(userProfile?.is_admin === true);

    if (!isAdminUser) {
      setError('Access Denied: Only administrators can unlock this portal.');
      setPin('');
      return;
    }

    const trimmedPin = pin.trim();
    if (!trimmedPin) {
      setError('Please enter passcode');
      return;
    }

    if (!supabase) {
      setError('Database connection error');
      return;
    }

    setLoading(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('verify_admin_pin', { p_pin: trimmedPin });
      
      if (rpcError) {
        setError(rpcError.message);
        setPin('');
        if (inputRef.current) {
          inputRef.current.focus();
        }
        return;
      }

      if (data === true) {
        onUnlockAdmin();
      } else {
        setError('Invalid Passcode');
        setPin('');
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Verification failed');
      setPin('');
      if (inputRef.current) {
        inputRef.current.focus();
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
    if (value.length <= 6) {
      setPin(value);
      setError(null);
    }
  };

  return (
    <div id="admin-pin-gateway" className="flex flex-col flex-1 justify-center py-8 relative px-4 max-w-sm mx-auto w-full animate-in fade-in duration-300">
      <button
        id="btn-back-to-login"
        onClick={onBackToLogin}
        disabled={loading}
        className="absolute top-0 left-4 text-xs text-gray-400 hover:text-[#00e5ff] flex items-center gap-1 font-semibold transition-colors disabled:opacity-50"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Player Portal
      </button>

      <div className="text-center mb-8 pt-8">
        <div className="w-16 h-16 mx-auto mb-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/10">
          <Shield className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-black text-amber-400 tracking-wider">
          ADMIN PORTAL
        </h2>
        <p className="text-xs text-gray-400 font-medium uppercase mt-1 tracking-widest">
          Secure Gateway Access
        </p>
      </div>

      {error && (
        <div id="admin-pin-error" className="mb-4 p-3.5 rounded-xl bg-red-500/25 border border-red-500/40 text-red-300 text-xs font-semibold flex items-center gap-2 animate-in shake duration-200">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form id="form-admin-pin" onSubmit={handleSubmit} className="space-y-6 bg-[#040e1a] border border-[#00e5ff]/20 p-6 rounded-2xl shadow-xl shadow-black/40">
        <div className="space-y-3 text-center">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">
            ENTER SECRET ACCESS PASSCODE
          </label>
          
          <div className="relative flex justify-center items-center">
            <input
              id="input-admin-passcode"
              ref={inputRef}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pin}
              onChange={handlePinChange}
              placeholder="••••••"
              maxLength={6}
              disabled={loading}
              required
              className="w-full bg-[#030a16] border border-gray-800 focus:border-amber-500 rounded-xl px-4 py-3.5 text-center text-2xl font-mono tracking-widest text-white placeholder-gray-700 focus:outline-none transition-colors disabled:opacity-50"
            />
          </div>
          
          <div className="flex justify-center gap-2.5 pt-2">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className={`w-3.5 h-3.5 rounded-full border transition-all duration-150 ${
                  i < pin.length
                    ? 'bg-amber-400 border-amber-400 scale-110 shadow-sm shadow-amber-400/50'
                    : 'bg-[#030a16] border-gray-800'
                }`}
              />
            ))}
          </div>
        </div>

        <button
          id="btn-admin-submit"
          type="submit"
          disabled={loading || pin.length === 0}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-black text-xs tracking-wider shadow-lg shadow-amber-500/10 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              VERIFYING...
            </>
          ) : (
            <>
              <Unlock className="w-4 h-4" />
              AUTHORIZE SYSTEM
            </>
          )}
        </button>
      </form>

      <p className="mt-8 text-center text-[10px] text-gray-500 font-semibold tracking-wider uppercase">
        🔐 Controlled Administrative Area
      </p>
    </div>
  );
};
