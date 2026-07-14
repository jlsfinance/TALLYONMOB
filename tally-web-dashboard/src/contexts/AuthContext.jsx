import { createContext, useContext, useState, useEffect } from 'react';
import { auth, companyApi, clearLocalSession, supabase } from '../lib/insforge';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

const sanitizeAppMode = (value) => {
    return value === 'tally' || value === 'billing' ? value : null;
};

const isAuthSessionError = (error) => {
    const message = String(error?.message || '').toLowerCase();
    const code = String(error?.code || '').toLowerCase();

    return (
        message.includes('invalid csrf')
        || message.includes('refresh token')
        || message.includes('token expired')
        || message.includes('unauthorized')
        || code === 'pgrst301'
        || String(error?.statusCode || '') === '401'
        || String(error?.statusCode || '') === '403'
    );
};
const withTimeout = (promise, ms, message) => {
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            setTimeout(() => reject(new Error(message)), ms);
        })
    ]);
};

const COMPANY_LOAD_TIMEOUT_MS = 12000;

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [companies, setCompanies] = useState([]);
    const [selectedCompany, setSelectedCompany] = useState(null);
    const [userRole, setUserRole] = useState('viewer');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchRole = async () => {
            if (user && selectedCompany) {
                try {
                    const { data, error } = await supabase.from('company_users')
                        .select('role')
                        .eq('company_id', selectedCompany.id)
                        .eq('user_id', user.id)
                        .maybeSingle();
                    if (!error && data) {
                        setUserRole(data.role);
                    } else {
                        setUserRole(selectedCompany.owner_id === user.id ? 'owner' : 'viewer');
                    }
                } catch (e) {
                    setUserRole('viewer');
                }
            } else {
                setUserRole('viewer');
            }
        };
        fetchRole();
    }, [user, selectedCompany]);
    const [appMode, setAppMode] = useState(() => {
        const storedMode = sanitizeAppMode(localStorage.getItem('appMode'));
        if (!storedMode) {
            localStorage.removeItem('appMode');
        }
        return storedMode;
    });

    const resetAuthState = () => {
        setUser(null);
        setCompanies([]);
        setSelectedCompany(null);
        localStorage.removeItem('selectedCompanyId');
        localStorage.removeItem('currentUserId');
    };

    useEffect(() => {
        if (user?.id) {
            localStorage.setItem('currentUserId', user.id);
        } else {
            localStorage.removeItem('currentUserId');
        }
    }, [user?.id]);

    useEffect(() => {
        checkSession();

        let unsubscribe = () => { };
        if (auth && typeof auth.onAuthStateChange === 'function') {
            try {
                const { data: { subscription } } = auth.onAuthStateChange((event, session) => {
                    if (event === 'TOKEN_REFRESHED') {
                        return;
                    }

                    if (event === 'SIGNED_OUT') {
                        resetAuthState();
                        return;
                    }

                    const authUser = session?.user || null;
                    if (authUser) {
                        setUser(authUser);
                        loadCompanies();
                    }
                });

                unsubscribe = () => subscription?.unsubscribe();
            } catch (e) {
                console.warn('Auth state change listener failed', e);
            }
        }

        return unsubscribe;
    }, []);

    const checkSession = async () => {
        try {
            const result = await withTimeout(
                typeof auth.getCurrentUser === 'function'
                    ? auth.getCurrentUser()
                    : auth.getCurrentSession(),
                10000,
                'Session check timed out'
            );

            const { data, error } = result || {};
            if (error) throw error;

            const sessionUser = data?.user || data?.session?.user || null;

            if (sessionUser) {
                setUser(sessionUser);
                await loadCompanies();
            } else {
                resetAuthState();
            }
        } catch (error) {
            if (isAuthSessionError(error)) {
                console.log('Session invalid/expired, clearing local auth state...');
                await clearLocalSession();
                resetAuthState();
            } else {
                console.error('Session check error:', error);
            }
        } finally {
            setLoading(false);
        }
    };

    const loadCompanies = async () => {
        let result;

        try {
            result = await withTimeout(
                companyApi.list(),
                COMPANY_LOAD_TIMEOUT_MS,
                'Company load timed out'
            );
        } catch (error) {
            console.error('Failed to load companies:', error);
            setCompanies([]);
            setSelectedCompany(null);
            return { data: [], error };
        }

        const { data, error } = result || {};

        if (error) {
            if (isAuthSessionError(error)) {
                console.log('Session check in loadCompanies failed, clearing auth...');
                await clearLocalSession();
                resetAuthState();
            } else {
                console.error('Failed to load companies:', error);
            }
            return { data: [], error };
        }

        if (data) {
            setCompanies(data);
            const saved = localStorage.getItem('selectedCompanyId');
            const found = data.find(c => c.id === saved);
            setSelectedCompany(found || null);
        }

        return { data: data || [], error: null };
    };

    const signIn = async (email, password) => {
        const { data, error } = await auth.signInWithPassword({ email, password });
        const signedInUser = data?.session?.user || data?.user || null;
        if (!error && signedInUser) {
            setUser(signedInUser);
            await loadCompanies();
        }
        return { data, error };
    };

    const signUp = async (email, password, fullName) => {
        const { data, error } = await auth.signUp({ email, password, name: fullName });
        return { data, error };
    };

    const verifyOtp = async (email, token, type = 'signup') => {
        const { data, error } = await auth.verifyEmail({ email: email, otp: token });
        const verifiedUser = data?.session?.user || data?.user || null;
        if (!error && verifiedUser) {
            setUser(verifiedUser);
            await loadCompanies();
        }
        return { data, error };
    };

    const sendVerificationEmail = async (email) => {
        const { error } = await auth.sendVerificationEmail({ email });
        return { error };
    };

    const signOut = async () => {
        await clearLocalSession();
        resetAuthState();
    };

    const selectCompany = (company) => {
        setSelectedCompany(company);
        localStorage.setItem('selectedCompanyId', company.id);
    };

    const deleteCompany = async (companyId) => {
        try {
            const { success, error } = await companyApi.deleteCompanyData(companyId);
            if (success) {
                await loadCompanies();
                if (selectedCompany?.id === companyId) {
                    setSelectedCompany(null);
                    localStorage.removeItem('selectedCompanyId');
                }
                return { success: true };
            }
            return { success: false, error };
        } catch (error) {
            return { success: false, error: error.message };
        }
    };

    const updateAppMode = (mode) => {
        const safeMode = sanitizeAppMode(mode);
        setAppMode(safeMode);
        if (safeMode) localStorage.setItem('appMode', safeMode);
        else localStorage.removeItem('appMode');
    };

    const signInWithGoogle = async () => {
        const redirectTo = `${window.location.origin}/auth/callback`;

        if (typeof auth.signInWithGoogle === 'function') {
            const { data, error } = await auth.signInWithGoogle({ redirectTo });
            return { data, error };
        }

        if (typeof auth.signInWithOAuth === 'function') {
            const { data, error } = await auth.signInWithOAuth({ provider: 'google', redirectTo });
            return { data, error };
        }

        return { data: null, error: new Error('Google sign-in is not available') };
    };

    const value = {
        user,
        companies,
        selectedCompany,
        userRole,
        loading,
        appMode,
        setAppMode: updateAppMode,
        signIn,
        signUp,
        signOut,
        verifyOtp,
        sendVerificationEmail,
        signInWithGoogle,
        selectCompany,
        deleteCompany,
        refreshCompanies: loadCompanies,
        verify2FALogin: auth.verify2FALogin,
        setup2FA: auth.setup2FA,
        enable2FA: auth.enable2FA,
        disable2FA: auth.disable2FA,
        get2FAStatus: auth.get2FAStatus
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};









