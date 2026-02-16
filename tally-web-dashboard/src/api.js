import axios from 'axios';

import { Capacitor } from '@capacitor/core';
const API_URL = Capacitor.isNativePlatform()
    ? 'https://tallyonmob.vercel.app/api/v1/data'
    : (import.meta.env.VITE_API_URL || 'https://tallyonmob.vercel.app/api/v1/data');

// Simplified ID based on latest sync logic
const COMPANY_ID = 'MAHESHWARI_FOOTWEAR';

const api = axios.create({
    baseURL: API_URL,
});

export const getDashboardData = async () => {
    try {
        const response = await api.get(`/${COMPANY_ID}/dashboard`);
        return response.data.data.summary;
    } catch (error) {
        return null;
    }
};

export const getLedgers = async () => {
    try {
        const response = await api.get(`/${COMPANY_ID}/ledgers?limit=50`);
        return response.data.data;
    } catch (error) {
        return [];
    }
};
