import { createContext, useContext, useState, useEffect } from 'react';
import { auth, companyApi } from '../lib/supabase';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [companies, setCompanies] = useState([]);
    const [selectedCompany, setSelectedCompany] = useState(null);
    const [loading, setLoading] = useState(true);
    const [appMode, setAppMode] = useState(localStorage.getItem('appMode') || null);

    useEffect(() => {
        // Check initial session
        checkSession();

        // Listen for auth changes with error handling
        const { data: { subscription } } = auth.onAuthStateChange((event, session) => {
            if (event === 'TOKEN_REFRESHED') {
                console.log('Token refreshed successfully');
            }

            if (event === 'SIGNED_OUT' || !session) {
                setUser(null);
                setCompanies([]);
                setSelectedCompany(null);
                return;
            }

            if (session?.user) {
                setUser(session.user);
                loadCompanies();
            }
        });

        return () => subscription?.unsubscribe();
    }, []);

    const checkSession = async () => {
        try {
            const session = await auth.getSession();
            // auth.getSession returns the session object directly
            if (session) {
                setUser(session.user);
                await loadCompanies();
            }
        } catch (error) {
            // Handle refresh token errors - sign out user to clear invalid tokens
            if (error?.message?.includes('Refresh Token') || error?.code === 'PGRST301') {
                console.log('Session expired, signing out...');
                await auth.signOut();
                setUser(null);
                setCompanies([]);
                setSelectedCompany(null);
                localStorage.removeItem('selectedCompanyId');
            } else {
                console.error('Session check error:', error);
            }
        } finally {
            setLoading(false);
        }
    };

    const loadCompanies = async () => {
        const { data, error } = await companyApi.list();
        if (!error && data) {
            setCompanies(data);
            // Auto-select first company
            const saved = localStorage.getItem('selectedCompanyId');
            const found = data.find(c => c.id === saved);
            setSelectedCompany(found || null);
        }
    };

    const signIn = async (email, password) => {
        const { data, error } = await auth.signIn(email, password);
        if (!error) {
            await loadCompanies();
        }
        return { data, error };
    };

    const signUp = async (email, password, fullName) => {
        const { data, error } = await auth.signUp(email, password, fullName);
        return { data, error };
    };

    const signOut = async () => {
        await auth.signOut();
        setUser(null);
        setCompanies([]);
        setSelectedCompany(null);
        localStorage.removeItem('selectedCompanyId');
    };

    const selectCompany = (company) => {
        setSelectedCompany(company);
        localStorage.setItem('selectedCompanyId', company.id);
    };

    // Delete company and all its data
    const deleteCompany = async (companyId) => {
        try {
            const { success, error } = await companyApi.deleteCompanyData(companyId);
            if (success) {
                // Refresh companies list
                await loadCompanies();
                // If deleted company was selected, clear selection
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
        setAppMode(mode);
        if (mode) localStorage.setItem('appMode', mode);
        else localStorage.removeItem('appMode');
    };

    const value = {
        user,
        companies,
        selectedCompany,
        loading,
        appMode,
        setAppMode: updateAppMode,
        signIn,
        signUp,
        signOut,
        selectCompany,
        deleteCompany,
        refreshCompanies: loadCompanies
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
