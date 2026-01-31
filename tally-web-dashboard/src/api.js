import axios from 'axios';

const API_URL = 'http://localhost:5000/api/v1/data';

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
