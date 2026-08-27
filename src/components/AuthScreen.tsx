import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, AlertCircle, ArrowLeft, KeyRound, Mail, CheckCircle2, Lock } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface AuthScreenProps {
  authMode: 'login' | 'signup';
  setAuthMode: (mode: 'login' | 'signup') => void;
  onSignUp: (data: {
    email: string;
    pass: string;
    name: string;
    username: string;
    pubgName: string;
    pubgId: string;
  }) => Promise<void>;
  onLogin: (email: string, pass: string) => Promise<void>;
  onBackToLanding: () => void;
  loading: boolean;
  authError?: string | null;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  authMode,
  setAuthMode,
  onSignUp,
  onLogin,
  onBackToLanding,
  loading,
  authError
}) => {
  // Input fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [pubgName, setPubgName] = useState('');
  const [pubgId, setPubgId] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // FEATURE 1: Login attempt lock
  const [failedAttempts, setFailedAttempts] = useState<number>(0);
  const [lockUntil, setLockUntil] = useState<number | null>(null);
  const [remainingLockTime, setRemainingLockTime] = useState<number>(0);

  // FEATURE 2: Forgot Password flow ('none' | 'send_email' | 'reset_password')
  const [forgotMode, setForgotMode] = useState<'none' | 'send_email' | 'reset_password'>('none');
  const [resetEmail, setResetEmail] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPass, setShowNewPass] = useState(false);
  const [resetMessage, setResetMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  // Sync resetEmail with standard email input
  useEffect(() => {
    if (email && !resetEmail) {
      setResetEmail(email);
    }
  }, [email]);

  // Listen for Supabase recovery session or recovery URL fragment
  useEffect(() => {
    if (isSupabaseConfigured() && supabase) {
      const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') {
          setForgotMode('reset_password');
          setResetMessage({
            type: 'success',
            text: 'Recovery session active. Please enter your new password below.'
          });
        }
      });

      if (
        window.location.hash.includes('type=recovery') ||
        window.location.search.includes('type=recovery')
      ) {
        setForgotMode('reset_password');
      }

      return () => {
        authListener?.subscription?.unsubscribe();
      };
    }
  }, []);

  // Timer countdown for lockout
  useEffect(() => {
    if (!lockUntil) {
      setRemainingLockTime(0);
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.ceil((lockUntil - now) / 1000));
      setRemainingLockTime(diff);

      if (diff <= 0) {
        setLockUntil(null);
        setFailedAttempts(0);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [lockUntil]);

  const formatMmSs = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `\( {mins.toString().padStart(2, '0')}: \){secs.toString().padStart(2, '0')}`;
  };
  const isLocked = lockUntil !== null && remainingLockTime > 0;

  const isValidEmail = (val: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (authMode === 'login' && isLocked) {
      setLocalError(`Too many failed attempts. Try again in ${formatMmSs(remainingLockTime)}`);
      return;
    }

    try {
      if (authMode === 'signup') {
        if (!isValidEmail(email)) {
          setLocalError('Please enter a valid email address.');
          return;
        }
        if (!name || !username || !pubgName || !pubgId) {
          setLocalError('Please fill in all PUBG character and profile details.');
          return;
        }
        if (password.length < 6) {
          setLocalError('Password must be at least 6 characters long.');
          return;
        }
        await onSignUp({
          email: email.trim(),
          pass: password,
          name: name.trim(),
          username: username.trim(),
          pubgName: pubgName.trim(),
          pubgId: pubgId.trim()
        });
      } else {
        if (!isValidEmail(email)) {
          setLocalError('Please enter a valid email address.');
          return;
        }
        await onLogin(email.trim(), password);
        setFailedAttempts(0);
        setLockUntil(null);
      }
    } catch (err: any) {
      if (authMode === 'login') {
        const nextAttempts = failedAttempts + 1;
        setFailedAttempts(nextAttempts);

        if (nextAttempts >= 7) {
          const lockTime = Date.now() + 5 * 60 * 1000;
          setLockUntil(lockTime);
          setRemainingLockTime(300);
          setLocalError('Invalid email or password');
        } else {
          setLocalError('Invalid email or password');
        }
      } else {
        setLocalError(err.message || 'Registration failed');
      }
    }
  };

  // Step A: Send reset email
  const handleSendResetEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetMessage(null);

    const emailToSend = (resetEmail || email).trim();
    if (!isValidEmail(emailToSend)) {
      setResetMessage({ type: 'error', text: 'Please enter a valid email address.' });
      return;
    }

    if (!isSupabaseConfigured() || !supabase) {
      setResetMessage({ type: 'error', text: 'Supabase Auth is not configured.' });
      return;
    }

    setResetLoading(true);
    try {
      const redirectUrl = window.location.origin;
      const { error } = await supabase.auth.resetPasswordForEmail(emailToSend, {
        redirectTo: redirectUrl
      });

      if (error) {
        setResetMessage({ type: 'error', text: error.message || 'Failed to send reset email.' });
      } else {
        setResetMessage({
          type: 'success',
          text: `Check your email! A password reset link has been sent to ${emailToSend}.`
        });
      }
    } catch (err: any) {
      setResetMessage({ type: 'error', text: err.message || 'An error occurred while sending reset email.' });
    } finally {
      setResetLoading(false);
    }
  };

  // Step B: Submit new password
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetMessage(null);

    if (newPassword.length < 6) {
      setResetMessage({ type: 'error', text: 'New password must be at least 6 characters long.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setResetMessage({ type: 'error', text: 'Passwords do not match.' });
      return;
    }

    if (!isSupabaseConfigured() || !supabase) {
      setResetMessage({ type: 'error', text: 'Supabase Auth is not configured.' });
      return;
    }

    setResetLoading(true);
    try {
      if (recoveryCode.trim()) {
        const targetEmail = (resetEmail || email).trim();
        if (targetEmail) {
          const { error: otpError } = await supabase.auth.verifyOtp({
            email: targetEmail,
            token: recoveryCode.trim(),
            type: 'recovery'
          });
          if (otpError) {
            setResetMessage({ type: 'error', text: 'Please enter a valid code' });
            setResetLoading(false);
            return;
          }
        }
      }

      const { data, error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) {
        setResetMessage({
          type: 'error',
          text: 'Please enter a valid code'
        });
      } else if (data?.user) {
        setResetMessage({
          type: 'success',
          text: 'Password updated successfully! Please login with your new password.'
        });
        setTimeout(() => {
          setForgotMode('none');
          setAuthMode('login');
          setPassword('');
          setNewPassword('');
          setConfirmPassword('');
          setRecoveryCode('');
          setResetMessage(null);
        }, 2200);
      } else {
        setResetMessage({
          type: 'error',
          text: 'Please enter a valid code'
        });
      }
    } catch (err: any) {
      setResetMessage({
        type: 'error',
        text: 'Please enter a valid code'
      });
    } finally {
      setResetLoading(false);
    }
  };

  const displayError = localError || authError;

  return (
    <div className="flex flex-col flex-1 justify-center py-4 relative">
      <button
        onClick={onBackToLanding}
        className="absolute top-0 left-0 text-xs text-gray-400 hover:text-[#00e5ff] flex items-center gap-1 font-semibold"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back
      </button>

      {/* FORGOT PASSWORD: STEP A */}
      {forgotMode === 'send_email' && (
        <div className="max-w-sm mx-auto w-full pt-6">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-full bg-[#00e5ff]/10 border border-[#00e5ff]/30 mx-auto flex items-center justify-center mb-3">
              <Mail className="w-6 h-6 text-[#00e5ff]" />
            </div>
            <h2 className="text-2xl font-black text-[#00e5ff] tracking-wide">RESET PASSWORD</h2>
            <p className="text-xs text-gray-400 font-medium mt-1">
              Enter your registered email address to receive a recovery link
            </p>
          </div>

          {resetMessage && (
            <div
              className={`mb-4 p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 animate-in fade-in ${
                resetMessage.type === 'success'
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                  : 'bg-red-500/20 border-red-500/50 text-red-300'
              }`}
            >
              {resetMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              )}
              <span>{resetMessage.text}</span>
            </div>
          )}

          <form onSubmit={handleSendResetEmail} className="space-y-3">
            <input
              type="email"
              placeholder="Your Email Address"
              value={resetEmail || email}
              onChange={(e) => setResetEmail(e.target.value)}
              className="w-full p-3 rounded-xl bg-[#07192e] border border-[#00e5ff]/30 text-white text-xs focus:outline-none focus:border-[#00e5ff] placeholder:text-gray-500"
              required
            />

            <button
              type="submit"
              disabled={resetLoading}
              className="w-full py-3.5 mt-2 rounded-xl font-black text-xs tracking-wider shadow-md active:scale-95 transition-all disabled:opacity-50 bg-gradient-to-r from-[#00e5ff] to-[#0088ff] text-[#030a16] shadow-[#00e5ff]/20 hover:brightness-110"
            >
              {resetLoading ? 'SENDING LINK...' : 'SEND RESET LINK'}
            </button>
          </form>

          <div className="mt-5 text-center space-y-2">
            <button
              type="button"
              onClick={() => {
                setResetMessage(null);
                setForgotMode('reset_password');
              }}
              className="text-xs text-[#00e5ff] hover:underline font-medium block mx-auto"
            >
              Already have a reset code or recovery link?
            </button>
            <button
              type="button"
              onClick={() => {
                setForgotMode('none');
                setResetMessage(null);
              }}
              className="text-xs text-gray-400 hover:text-white transition-colors font-medium block mx-auto"
            >
              Back to Login
            </button>
          </div>
        </div>
      )}{/* FORGOT PASSWORD: STEP B */}
      {forgotMode === 'reset_password' && (
        <div className="max-w-sm mx-auto w-full pt-6">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-full bg-[#00e5ff]/10 border border-[#00e5ff]/30 mx-auto flex items-center justify-center mb-3">
              <KeyRound className="w-6 h-6 text-[#00e5ff]" />
            </div>
            <h2 className="text-2xl font-black text-[#00e5ff] tracking-wide">CREATE NEW PASSWORD</h2>
            <p className="text-xs text-gray-400 font-medium mt-1">Set a new secure password for your account</p>
          </div>

          {resetMessage && (
            <div
              className={`mb-4 p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 animate-in fade-in ${
                resetMessage.type === 'success'
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                  : 'bg-red-500/20 border-red-500/50 text-red-300'
              }`}
            >
              {resetMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              )}
              <span>{resetMessage.text}</span>
            </div>
          )}

          <form onSubmit={handleUpdatePassword} className="space-y-3">
            <input
              type="text"
              placeholder="Recovery Code (Optional if using email link)"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
              className="w-full p-3 rounded-xl bg-[#07192e] border border-[#00e5ff]/30 text-white text-xs focus:outline-none focus:border-[#00e5ff] placeholder:text-gray-500"
            />

            <div className="relative">
              <input
                type={showNewPass ? 'text' : 'password'}
                placeholder="New Password (min 6 chars)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full p-3 rounded-xl bg-[#07192e] border border-[#00e5ff]/30 text-white text-xs focus:outline-none focus:border-[#00e5ff] placeholder:text-gray-500 pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowNewPass(!showNewPass)}
                className="absolute right-3 top-3 text-gray-400 hover:text-white"
              >
                {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <input
              type="password"
              placeholder="Confirm New Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full p-3 rounded-xl bg-[#07192e] border border-[#00e5ff]/30 text-white text-xs focus:outline-none focus:border-[#00e5ff] placeholder:text-gray-500"
              required
            />

            <button
              type="submit"
              disabled={resetLoading}
              className="w-full py-3.5 mt-2 rounded-xl font-black text-xs tracking-wider shadow-md active:scale-95 transition-all disabled:opacity-50 bg-gradient-to-r from-[#00e5ff] to-[#0088ff] text-[#030a16] shadow-[#00e5ff]/20 hover:brightness-110"
            >
              {resetLoading ? 'UPDATING...' : 'UPDATE PASSWORD'}
            </button>
          </form>

          <div className="mt-5 text-center space-y-2">
            <button
              type="button"
              onClick={() => {
                setForgotMode('send_email');
                setResetMessage(null);
              }}
              className="text-xs text-gray-400 hover:text-[#00e5ff] transition-colors font-medium block mx-auto"
            >
              Request a new reset link
            </button>
            <button
              type="button"
              onClick={() => {
                setForgotMode('none');
                setResetMessage(null);
              }}
              className="text-xs text-gray-400 hover:text-white transition-colors font-medium block mx-auto"
            >
              Back to Login
            </button>
          </div>
        </div>
      )}

      {/* STANDARD AUTH MODE (LOGIN / SIGNUP) */}
      {forgotMode === 'none' && (
        <>
          <div className="text-center mb-6 pt-6">
            <h2 className="text-2xl font-black text-[#00e5ff] tracking-wide">
              {authMode === 'signup' ? 'CREATE ACCOUNT' : 'WELCOME BACK'}
            </h2>
            <p className="text-xs text-gray-400 font-medium">Enter your esports credentials</p>
          </div>

          {displayError && (
            <div className="max-w-sm mx-auto w-full mb-3 p-3 rounded-xl bg-red-500/20 border border-red-500/50 text-red-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span>{displayError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3 max-w-sm mx-auto w-full">
            {authMode === 'signup' && (
              <>
                <input
                  type="text"
                  placeholder="Full Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full p-3 rounded-xl bg-[#07192e] border border-[#00e5ff]/30 text-white text-xs focus:outline-none focus:border-[#00e5ff] placeholder:text-gray-500"
                  required
                />
                <input
                  type="text"
                  placeholder="App Unique Username (e.g. Ahmad99)"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full p-3 rounded-xl bg-[#07192e] border border-[#00e5ff]/30 text-white text-xs focus:outline-none focus:border-[#00e5ff] placeholder:text-gray-500"
                  required
                />
                <input
                  type="text"
                  placeholder="PUBG Character ID Name"
                  value={pubgName}
                  onChange={(e) => setPubgName(e.target.value)}
                  className="w-full p-3 rounded-xl bg-[#07192e] border border-[#00e5ff]/30 text-white text-xs focus:outline-none focus:border-[#00e5ff] placeholder:text-gray-500"
                  required
                />
                <input
                  type="text"
                  placeholder="PUBG UID (e.g. 5164893012)"
                  value={pubgId}
                  onChange={(e) => setPubgId(e.target.value)}
                  className="w-full p-3 rounded-xl bg-[#07192e] border border-[#00e5ff]/30 text-white text-xs focus:outline-none focus:border-[#00e5ff] placeholder:text-gray-500"
                  required
                />
              </>
            )}

            <input
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 rounded-xl bg-[#07192e] border border-[#00e5ff]/30 text-white text-xs focus:outline-none focus:border-[#00e5ff] placeholder:text-gray-500"
              required
            />

            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-3 rounded-xl bg-[#07192e] border border-[#00e5ff]/30 text-white text-xs focus:outline-none focus:border-[#00e5ff] placeholder:text-gray-500 pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-3 text-gray-400 hover:text-white"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading || (authMode === 'login' && isLocked)}
              className={`w-full py-3.5 mt-2 rounded-xl font-black text-xs tracking-wider shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5 ${
                authMode === 'login' && isLocked
                  ? 'bg-gray-800 border border-red-500/50 text-red-400 cursor-not-allowed opacity-80 shadow-none'
                  : 'bg-gradient-to-r from-[#00e5ff] to-[#0088ff] text-[#030a16] shadow-[#00e5ff]/20 hover:brightness-110 disabled:opacity-50'
              }`}
            >
              {loading ? (
                'Processing...'
              ) : authMode === 'login' && isLocked ? (
                <>
                  <Lock className="w-3.5 h-3.5 text-red-400" />
                  <span>LOGIN LOCKED ({formatMmSs(remainingLockTime)})</span>
                </>
              ) : authMode === 'signup' ? (
                'REGISTER ESPORTS ACCOUNT'
              ) : (
                'LOGIN TO ARENA'
              )}
            </button>
          </form>

          {/* Forgot Password Link */}
          {authMode === 'login' && (
            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={() => {
                  setResetEmail(email);
                  setResetMessage(null);
                  setForgotMode('send_email');
                }}
                className="text-xs text-[#00e5ff] hover:underline font-semibold transition-colors"
              >
                Forgot password?
              </button>
            </div>
          )}

          <div className="mt-5 text-center space-y-3">
            <button
              type="button"
              onClick={() => {
                setLocalError(null);
                setAuthMode(authMode === 'signup' ? 'login' : 'signup');
              }}
              className="w-full py-3 px-4 rounded-xl bg-[#00e5ff]/10 border border-[#00e5ff]/40 text-[#00e5ff] hover:bg-[#00e5ff]/20 font-bold text-sm uppercase tracking-wider transition-all duration-200 block text-center active:scale-95"
            >
              {authMode === 'signup' ? 'Already have an account? Login' : "Don't have an account? Create one"}
            </button>
          </div>
        </>
      )}
    </div>
  );
};