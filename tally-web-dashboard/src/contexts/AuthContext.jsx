import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { auth, companyApi, clearLocalSession, supabase } from '../lib/insforge';
import { Capacitor } from '@capacitor/core';
import { hasAdminAccess } from '../lib/adminAccess';
import { evaluatePermission, normalizeRoleKey } from '../lib/rbacPermissions.mjs';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

// Module chooser removed: the app is Tally-on-Mobile only, so appMode is always 'tally'.
const sanitizeAppMode = () => 'tally';

const isAuthSessionError = (error) => {
    const message = String(error?.message || '').toLowerCase();
    const code = String(error?.code || '').toLowerCase();

    return (
        message.includes('invalid csrf')
        || message.includes('refresh token')
        || message.includes('token expired')
        || message.includes('unauthorized')
        || message.includes('authsessionmissing')
        || message.includes('session missing')
        || message.includes('session_missing')
        || code === 'pgrst301'
        || code === 'auth_session_missing'
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
    const [membershipStatus, setMembershipStatus] = useState('none');
    const [permissions, setPermissions] = useState({});
    const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
    const [permissionsLoading, setPermissionsLoading] = useState(false);
    const [loading, setLoading] = useState(true);

    const claimPendingInvitations = useCallback(async () => {
        try {
            await withTimeout(
                supabase.rpc('accept_pending_invitations'),
                4000,
                'Invitation claim timed out'
            );
        } catch {
            // Best-effort: older schemas or offline sessions proceed cleanly
        }
    }, []);

    useEffect(() => {
        let active = true;
        const resolvePlatformAdmin = async () => {
            if (!user?.id) {
                if (active) setIsPlatformAdmin(false);
                return;
            }
            if (hasAdminAccess(user)) {
                if (active) setIsPlatformAdmin(true);
                return;
            }
            try {
                const { data } = await supabase
                    .from('user_profiles')
                    .select('is_admin')
                    .eq('id', user.id)
                    .maybeSingle();
                if (active) setIsPlatformAdmin(data?.is_admin === true);
            } catch {
                if (active) setIsPlatformAdmin(false);
            }
        };
        void resolvePlatformAdmin();
        return () => { active = false; };
    }, [user]);

    const loadPermissions = useCallback(async () => {
        if (!user?.id || !selectedCompany?.id) {
            setUserRole('viewer');
            setMembershipStatus('none');
            setPermissions({});
            setPermissionsLoading(false);
            return;
        }

        setPermissionsLoading(true);
        try {
            const { data: rpcData, error: rpcError } = await supabase.rpc('rbac_get_my_permissions', {
                p_company_id: selectedCompany.id,
            });

            if (!rpcError && rpcData) {
                const adminFlag = Boolean(rpcData.is_super_admin || rpcData.is_admin);
                if (adminFlag) {
                    setIsPlatformAdmin(true);
                }
                setUserRole(rpcData.role || (selectedCompany.owner_id === user.id ? 'owner' : 'viewer'));
                setMembershipStatus(rpcData.status || (selectedCompany.owner_id === user.id ? 'active' : 'none'));
                setPermissions(rpcData.permissions || {});
                return;
            }

            if (selectedCompany.owner_id === user.id) {
                setUserRole('owner');
                setMembershipStatus('active');
                setPermissions({});
                return;
            }

            const { data: cu, error: cuError } = await supabase
                .from('company_users')
                .select('role, status')
                .eq('company_id', selectedCompany.id)
                .eq('user_id', user.id)
                .maybeSingle();

            if (cuError || !cu) {
                setUserRole('viewer');
                setMembershipStatus('none');
                setPermissions({});
                return;
            }

            const status = cu.status || 'active';
            setUserRole(cu.role || 'viewer');
            setMembershipStatus(status);

            if (status !== 'active') {
                setPermissions({});
                return;
            }

            const roleKey = normalizeRoleKey(cu.role);
            const { data: roles } = await supabase
                .from('user_roles')
                .select('id, name, display_name, permissions');
            const matched = (roles || []).find(
                (r) =>
                    normalizeRoleKey(r.name) === roleKey ||
                    normalizeRoleKey(r.display_name) === roleKey ||
                    String(r.id) === String(cu.role)
            );
            setPermissions(matched?.permissions || {});
        } catch {
            setUserRole(selectedCompany.owner_id === user.id ? 'owner' : 'viewer');
            setMembershipStatus(selectedCompany.owner_id === user.id ? 'active' : 'none');
            setPermissions({});
        } finally {
            setPermissionsLoading(false);
        }
    }, [user?.id, selectedCompany?.id, selectedCompany?.owner_id]);

    useEffect(() => {
        void loadPermissions();
    }, [loadPermissions]);

    const can = useCallback((permission) => {
        return evaluatePermission(permissions, userRole, permission, {
            isAdmin: isPlatformAdmin,
            isOwner: Boolean(selectedCompany?.owner_id && user?.id && selectedCompany.owner_id === user.id),
            status: membershipStatus,
        });
    }, [permissions, userRole, isPlatformAdmin, selectedCompany?.owner_id, user?.id, membershipStatus]);

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
        setUserRole('viewer');
        setMembershipStatus('none');
        setPermissions({});
        setIsPlatformAdmin(false);
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
                        void claimPendingInvitations().then(() => loadCompanies());
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
            if (error && error.message?.includes('session')) {
                // Session genuinely expired/invalid
                console.log('Session expired, clearing...');
                await clearLocalSession();
                resetAuthState();
                return;
            }

            const sessionUser = data?.user || data?.session?.user || null;

            if (sessionUser) {
                setUser(sessionUser);
                await claimPendingInvitations();
                await loadCompanies();
            } else {
                // No session yet - this is normal for first visit
                setLoading(false);
                return;
            }
        } catch (error) {
            // Don't clear session on every error - might be network issue
            console.error('Session check error:', error);
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
            await claimPendingInvitations();
            await loadCompanies();
        }
        return { data, error };
    };

    const signUp = async (email, password, fullName) => {
        const { data, error } = await auth.signUp({ email, password, name: fullName });
        if (error) return { data, error };

        const signedUpUser = data?.session?.user || data?.user || null;
        if (signedUpUser) {
            setUser(signedUpUser);
        }

        return { data, error };
    };

    const verifyOtp = async (email, token, type = 'signup') => {
        const { data, error } = await auth.verifyEmail({ email: email, otp: token });
        const verifiedUser = data?.session?.user || data?.user || null;
        if (!error && verifiedUser) {
            setUser(verifiedUser);
            await claimPendingInvitations();
            await loadCompanies();
        }
        return { data, error };
    };

    const sendVerificationEmail = async (email) => {
        const { error } = await auth.sendVerificationEmail({ email });
        return { error };
    };

    const resetPasswordForEmail = async (email) => {
        const { error } = await auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/auth/reset-password`,
        });
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
        if (Capacitor.getPlatform() === 'android') {
            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: 'com.syncoraa.app://auth/callback', skipBrowserRedirect: true },
            });
            if (error || !data?.url) return { data, error: error || new Error('Google login URL unavailable') };
            try {
                const { Browser } = await import('@capacitor/browser');
                await Browser.open({ url: data.url });
                return { data, error: null };
            } catch (error) {
                return { data: null, error };
            }
        }
        const redirectTo = `${window.location.origin}/auth/callback`;

        if (typeof auth.signInWithGoogle === 'function') {
            const { data, error } = await auth.signInWithGoogle({ redirectTo });
            return { data, error };
        }

        if (typeof auth.signInWithOAuth === 'function') {
            const { data, error } = await auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
            return { data, error };
        }

        return { data: null, error: new Error('Google sign-in is not available') };
    };

    const value = {
        user,
        companies,
        selectedCompany,
        userRole,
        membershipStatus,
        permissions,
        isPlatformAdmin,
        isSuperAdmin: isPlatformAdmin,
        permissionsLoading,
        can,
        refreshPermissions: loadPermissions,
        loading,
        appMode,
        setAppMode: updateAppMode,
        signIn,
        signUp,
        signOut,
        verifyOtp,
        sendVerificationEmail,
        resetPasswordForEmail,
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
