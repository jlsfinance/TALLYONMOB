import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Mail, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import TermsModal from '../modules/accounting/pages/TermsModal';
import { PrivacyDisclosureModal } from './PrivacyDisclosureModal';

// Google Logo Component
const GoogleLogo = () => (
  <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

export const Auth = () => {
  const { signIn, signUp, signInWithGoogle, resetPassword } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // Modal State
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const handleResetPassword = async () => {
    if (!email) {
      setError("Please enter your email address first.");
      return;
    }
    setLoading(true);
    setError('');
    try {
      await resetPassword(email);
      setResetSent(true);
      setError('');
    } catch (err: any) {
      console.error("Reset Error:", err);
      setError(err.message || "Failed to send reset email.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setResetSent(false);

    try {
      if (isLogin) {
        await signIn(email, password);
      } else {
        await signUp(email, password);
      }
    } catch (err: any) {
      console.error("Auth Error:", err);
      let msg = "Authentication failed.";
      if (err.code?.includes("auth/invalid-email")) msg = "Invalid email address.";
      if (err.code?.includes("auth/user-not-found") || err.code?.includes("auth/invalid-credential")) msg = "Invalid email or password.";
      if (err.code?.includes("auth/wrong-password")) msg = "Incorrect password.";
      if (err.code?.includes("auth/email-already-in-use")) msg = "Email already registered.";
      if (err.code?.includes("auth/weak-password")) msg = "Password should be at least 6 characters.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 pt-safe-top pb-safe-bottom bg-background font-sans relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-google-blue/5 blur-3xl opacity-50" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] rounded-full bg-google-green/5 blur-3xl opacity-50" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-[400px] bg-surface-container rounded-[28px] border border-border p-8 shadow-xl relative z-10"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-google-blue text-white rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-google-blue/30">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2 font-heading tracking-tight">
            {isLogin ? 'Welcome back' : 'Create an account'}
          </h1>
          <p className="text-sm text-muted-foreground font-medium">
            {isLogin ? 'Enter your details to sign in' : 'Start your digital billing journey'}
          </p>
        </div>

        {/* Main Form */}
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Floating Label Input - Email */}
          <div className="relative group">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder=" "
              className="peer w-full h-14 px-4 bg-surface-container-high rounded-[16px] border-2 border-transparent text-foreground font-medium placeholder-transparent focus:outline-none focus:border-google-blue focus:bg-surface-container transition-all"
            />
            <label className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium transition-all peer-focus:-top-2 peer-focus:left-2 peer-focus:text-xs peer-focus:text-google-blue peer-focus:bg-surface-container peer-focus:px-2 peer-not-placeholder-shown:-top-2 peer-not-placeholder-shown:left-2 peer-not-placeholder-shown:text-xs peer-not-placeholder-shown:text-muted-foreground peer-not-placeholder-shown:bg-surface-container peer-not-placeholder-shown:px-2 pointer-events-none">
              Email address
            </label>
            <Mail className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground peer-focus:text-google-blue transition-colors pointer-events-none" />
          </div>

          {/* Floating Label Input - Password */}
          <div className="relative group">
            <input
              type={showPassword ? 'text' : 'password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder=" "
              className="peer w-full h-14 px-4 bg-surface-container-high rounded-[16px] border-2 border-transparent text-foreground font-medium placeholder-transparent focus:outline-none focus:border-google-blue focus:bg-surface-container transition-all pr-12"
            />
            <label className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium transition-all peer-focus:-top-2 peer-focus:left-2 peer-focus:text-xs peer-focus:text-google-blue peer-focus:bg-surface-container peer-focus:px-2 peer-not-placeholder-shown:-top-2 peer-not-placeholder-shown:left-2 peer-not-placeholder-shown:text-xs peer-not-placeholder-shown:text-muted-foreground peer-not-placeholder-shown:bg-surface-container peer-not-placeholder-shown:px-2 pointer-events-none">
              Password
            </label>
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          {isLogin && (
            <div className="flex justify-end px-1">
              <button
                type="button"
                onClick={handleResetPassword}
                disabled={loading}
                className="text-xs font-bold text-google-blue hover:text-blue-600 transition-colors"
              >
                Forgot Password?
              </button>
            </div>
          )}

          <AnimatePresence>
            {resetSent && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-google-green/10 text-google-green p-3 rounded-xl text-xs font-bold flex items-center gap-2"
              >
                <div className="w-4 h-4 rounded-full bg-google-green flex items-center justify-center text-white text-[10px]">✓</div>
                Password reset email sent! Check your inbox.
              </motion.div>
            )}
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-google-red/10 text-google-red p-3 rounded-xl text-xs font-bold flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-4 rounded-[18px] text-sm font-bold uppercase tracking-widest text-white shadow-google shadow-google-blue/30 transition-all transform active:scale-[0.98] ${loading ? 'bg-slate-400 cursor-not-allowed' : 'bg-google-blue hover:bg-blue-600'
              }`}
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Verifying...</span>
              </div>
            ) : (isLogin ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <div className="relative flex py-2 items-center">
          <div className="flex-grow border-t border-border"></div>
          <span className="flex-shrink-0 mx-4 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Or continue with</span>
          <div className="flex-grow border-t border-border"></div>
        </div>

        <button
          type="button"
          onClick={async () => {
            setError('');
            setLoading(true);
            try {
              await signInWithGoogle();
            } catch (err: any) {
              console.error("Google Sign In Error:", err);
              setError(err.message || "Google sign in failed");
              setLoading(false);
            }
          }}
          disabled={loading}
          className="w-full py-3.5 rounded-[18px] bg-surface-container-high border border-transparent hover:border-border text-foreground font-bold text-sm flex items-center justify-center transition-all hover:bg-surface-container-highest active:scale-[0.98]"
        >
          <GoogleLogo />
          Google Account
        </button>

        {/* Footer / Toggle */}
        <div className="mt-8 text-center">
          <p className="text-sm text-muted-foreground font-medium">
            {isLogin ? "Don't have an account?" : "Already have an account?"}
            <button
              onClick={() => { setIsLogin(!isLogin); setError(''); }}
              className="ml-1.5 text-google-blue font-bold hover:text-blue-600 transition-colors"
            >
              {isLogin ? 'Sign Up' : 'Sign In'}
            </button>
          </p>
        </div>
      </motion.div>

      {/* Compliance / Legal Footer */}
      <div className="mt-8 max-w-xs text-center space-y-4 relative z-0 opacity-60">
        <div className="flex items-center justify-center gap-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
          <button onClick={() => setShowPrivacy(true)} className="hover:text-google-blue transition-colors">Privacy Policy</button>
          <span>•</span>
          <button onClick={() => setShowTerms(true)} className="hover:text-google-blue transition-colors">Terms</button>
        </div>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          By continuing, you agree to our Terms of Service and acknowledge you have read our Privacy Policy.
        </p>
        <div className="flex items-center justify-center gap-1.5 text-[9px] text-google-green font-bold uppercase tracking-wider">
          <div className="w-1.5 h-1.5 rounded-full bg-google-green animate-pulse" />
          Encrypted & Secure
        </div>
      </div>

      {/* Modals */}
      <TermsModal isOpen={showTerms} onClose={() => setShowTerms(false)} />
      <PrivacyDisclosureModal isOpen={showPrivacy} onAccept={() => setShowPrivacy(false)} />
    </div>
  );
};

export default Auth;
