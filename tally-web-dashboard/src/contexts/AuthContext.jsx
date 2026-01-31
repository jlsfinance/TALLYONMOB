import { createContext, useContext, useState, useEffect } from 'react';
import { auth, companyApi } from '../lib/supabase';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [companies, setCompanies] = useState([]);
    const [selectedCompany, setSelectedCompany] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check initial session
        checkSession();

        // Listen for auth changes
        const { data: { subscription } } = auth.onAuthStateChange((event, session) => {
            if (session?.user) {
                setUser(session.user);
                loadCompanies();
            } else {
                setUser(null);
                setCompanies([]);
                setSelectedCompany(null);
            }
        });

        return () => subscription?.unsubscribe();
    }, []);

    const checkSession = async () => {
        try {
            const session = await auth.getSession();
            if (session?.user) {
                setUser(session.user);
                await loadCompanies();
            }
        } catch (error) {
            console.error('Session check error:', error);
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
            setSelectedCompany(found || data[0] || null);
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

    const value = {
        user,
        companies,
        selectedCompany,
        loading,
        signIn,
        signUp,
        signOut,
        selectCompany,
        refreshCompanies: loadCompanies
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
