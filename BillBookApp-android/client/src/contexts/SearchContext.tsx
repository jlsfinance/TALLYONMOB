/**
 * SearchContext - Global Search State Manager
 * Provides centralized search state across the app
 */

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { StorageService } from '../services/storageService';
import { Invoice, Customer } from '../types';

interface SearchResultItem {
    id: string;
    type: 'invoice' | 'customer' | 'product';
    title: string;
    subtitle: string;
    data: any;
}

interface SearchContextType {
    isSearchVisible: boolean;
    setSearchVisible: (visible: boolean) => void;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    searchResults: SearchResultItem[];
    isSearching: boolean;
    clearSearch: () => void;
}

const SearchContext = createContext<SearchContextType | undefined>(undefined);

export const SearchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isSearchVisible, setSearchVisible] = useState(false);
    const [searchQuery, setSearchQueryState] = useState('');
    const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    const performSearch = useCallback((query: string) => {
        if (!query.trim()) {
            setSearchResults([]);
            setIsSearching(false);
            return;
        }

        setIsSearching(true);
        const lowerQuery = query.toLowerCase().trim();
        const results: SearchResultItem[] = [];

        // Search Invoices
        const invoices = StorageService.getInvoices() as Invoice[];
        invoices.forEach(inv => {
            if (
                inv.customerName?.toLowerCase().includes(lowerQuery) ||
                inv.invoiceNumber?.toLowerCase().includes(lowerQuery) ||
                inv.total?.toString().includes(lowerQuery)
            ) {
                results.push({
                    id: inv.id,
                    type: 'invoice',
                    title: inv.customerName || 'Unknown',
                    subtitle: `#${inv.invoiceNumber} • ₹${inv.total?.toLocaleString('en-IN')}`,
                    data: inv
                });
            }
        });

        // Search Customers
        const customers = StorageService.getCustomers() as Customer[];
        customers.forEach(cust => {
            if (
                cust.name?.toLowerCase().includes(lowerQuery) ||
                cust.phone?.includes(lowerQuery) ||
                cust.company?.toLowerCase().includes(lowerQuery)
            ) {
                results.push({
                    id: cust.id,
                    type: 'customer',
                    title: cust.name || 'Unknown',
                    subtitle: cust.phone || cust.company || '',
                    data: cust
                });
            }
        });

        // Search Products
        const products = StorageService.getProducts() || [];
        products.forEach((prod: any) => {
            if (
                prod.name?.toLowerCase().includes(lowerQuery) ||
                prod.category?.toLowerCase().includes(lowerQuery)
            ) {
                results.push({
                    id: prod.id,
                    type: 'product',
                    title: prod.name || 'Unknown',
                    subtitle: `₹${prod.price?.toLocaleString('en-IN') || '0'}`,
                    data: prod
                });
            }
        });

        setSearchResults(results.slice(0, 50));
        setIsSearching(false);
    }, []);

    const setSearchQuery = useCallback((query: string) => {
        setSearchQueryState(query);
        const timeoutId = setTimeout(() => {
            performSearch(query);
        }, 300);
        return () => clearTimeout(timeoutId);
    }, [performSearch]);

    const clearSearch = useCallback(() => {
        setSearchQueryState('');
        setSearchResults([]);
        setSearchVisible(false);
    }, []);

    const value = useMemo(() => ({
        isSearchVisible,
        setSearchVisible,
        searchQuery,
        setSearchQuery,
        searchResults,
        isSearching,
        clearSearch
    }), [isSearchVisible, searchQuery, searchResults, isSearching, setSearchQuery, clearSearch]);

    return (
        <SearchContext.Provider value={value}>
            {children}
        </SearchContext.Provider>
    );
};

export const useSearch = () => {
    const context = useContext(SearchContext);
    if (context === undefined) {
        throw new Error('useSearch must be used within a SearchProvider');
    }
    return context;
};

export default SearchContext;
