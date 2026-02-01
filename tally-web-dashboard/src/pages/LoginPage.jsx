import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import './LoginPage.css';

export default function LoginPage() {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const { signIn, signUp } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (isLogin) {
                const { error } = await signIn(email, password);
                if (error) {
                    toast.error(error.message);
                } else {
                    toast.success('Login successful!');
                    navigate('/');
                }
            } else {
                const { error } = await signUp(email, password, fullName);
                if (error) {
                    toast.error(error.message);
                } else {
                    toast.success('Account created! Please check your email to verify.');
                    setIsLogin(true);
                }
            }
        } catch (err) {
            toast.error('Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-3d">
            {/* Animated Background */}
            <div className="login-3d__bg-grid" />
            <div className="login-3d__bg-orbs">
                <div className="login-3d__orb login-3d__orb--1" />
                <div className="login-3d__orb login-3d__orb--2" />
                <div className="login-3d__orb login-3d__orb--3" />
            </div>

            <div className="login-3d__container">
                {/* Logo */}
                <div className="login-3d__logo-section">
                    <div className="login-3d__logo">
                        <span className="login-3d__logo-icon">📊</span>
                    </div>
                    <h1 className="login-3d__brand">LiveKeeping</h1>
                    <p className="login-3d__tagline">Premium Tally Analytics</p>
                </div>

                {/* Glass Card */}
                <div className="login-3d__card">
                    <h2 className="login-3d__title">
                        {isLogin ? 'Welcome Back' : 'Create Account'}
                    </h2>
                    <p className="login-3d__subtitle">
                        {isLogin
                            ? 'Enter your credentials to access your dashboard'
                            : 'Sign up to sync your Tally data'}
                    </p>

                    <form onSubmit={handleSubmit} className="login-3d__form">
                        {!isLogin && (
                            <div className="login-3d__field">
                                <label className="login-3d__label">Full Name</label>
                                <div className="login-3d__input-wrapper">
                                    <span className="login-3d__input-icon">👤</span>
                                    <input
                                        type="text"
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        className="login-3d__input"
                                        placeholder="Your name"
                                        required={!isLogin}
                                    />
                                </div>
                            </div>
                        )}

                        <div className="login-3d__field">
                            <label className="login-3d__label">Email</label>
                            <div className="login-3d__input-wrapper">
                                <span className="login-3d__input-icon">✉️</span>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="login-3d__input"
                                    placeholder="you@example.com"
                                    required
                                />
                            </div>
                        </div>

                        <div className="login-3d__field">
                            <label className="login-3d__label">Password</label>
                            <div className="login-3d__input-wrapper">
                                <span className="login-3d__input-icon">🔒</span>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="login-3d__input"
                                    placeholder="••••••••"
                                    required
                                    minLength={6}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="login-3d__toggle-password"
                                >
                                    {showPassword ? '🙈' : '👁️'}
                                </button>
                            </div>
                        </div>

                        {isLogin && (
                            <div className="login-3d__options">
                                <label className="login-3d__remember">
                                    <input type="checkbox" className="login-3d__checkbox" />
                                    <span>Remember me</span>
                                </label>
                                <a href="#" className="login-3d__forgot">Forgot Password?</a>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="login-3d__submit"
                        >
                            {loading ? (
                                <>
                                    <div className="login-3d__spinner" />
                                    Processing...
                                </>
                            ) : (
                                <>
                                    {isLogin ? 'Sign In' : 'Create Account'}
                                    <span className="login-3d__submit-arrow">→</span>
                                </>
                            )}
                        </button>
                    </form>

                    <div className="login-3d__divider">
                        <span>or continue with</span>
                    </div>

                    <div className="login-3d__social">
                        <button className="login-3d__social-btn">
                            <svg className="login-3d__social-icon" viewBox="0 0 24 24">
                                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                            Google
                        </button>
                        <button className="login-3d__social-btn">
                            <svg className="login-3d__social-icon" viewBox="0 0 24 24">
                                <path fill="currentColor" d="M3 3h8v8H3V3m10 0h8v8h-8V3M3 13h8v8H3v-8m10 0h8v8h-8v-8" />
                            </svg>
                            Microsoft
                        </button>
                    </div>

                    <div className="login-3d__switch">
                        <button onClick={() => setIsLogin(!isLogin)}>
                            {isLogin
                                ? "Don't have an account? Sign Up"
                                : "Already have an account? Sign In"}
                        </button>
                    </div>
                </div>

                {/* Features */}
                <div className="login-3d__features">
                    <div className="login-3d__feature">
                        <span className="login-3d__feature-icon">🔄</span>
                        <span className="login-3d__feature-text">Auto Sync</span>
                    </div>
                    <div className="login-3d__feature">
                        <span className="login-3d__feature-icon">📊</span>
                        <span className="login-3d__feature-text">Analytics</span>
                    </div>
                    <div className="login-3d__feature">
                        <span className="login-3d__feature-icon">🔐</span>
                        <span className="login-3d__feature-text">Secure</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
