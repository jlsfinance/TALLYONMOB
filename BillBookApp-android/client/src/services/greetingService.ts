import { CompanyProfile, Festival } from '@/types';

// Hardcoded for 2025-2026 as per request to avoid complex lunar logic for now
// Ideally this comes from a backend or a smart library
export const FESTIVALS_2025: Festival[] = [
    { name: "New Year's Day", date: "2025-01-01", defaultMessage: "Happy New Year! May this year bring you success and prosperity." },
    { name: "Makar Sankranti", date: "2025-01-14", defaultMessage: "Happy Makar Sankranti! May the sun radiate peace and prosperity in your life." },
    { name: "Republic Day", date: "2025-01-26", defaultMessage: "Happy Republic Day! Let's salute the nation." },
    { name: "Holi", date: "2025-03-14", defaultMessage: "Happy Holi! May your life be filled with colors of joy." },
    { name: "Eid-ul-Fitr", date: "2025-03-31", defaultMessage: "Eid Mubarak! Wishing you and your family peace and harmony." },
    { name: "Raksha Bandhan", date: "2025-08-09", defaultMessage: "Happy Raksha Bandhan! Celebrating the bond of love and protection." },
    { name: "Independence Day", date: "2025-08-15", defaultMessage: "Happy Independence Day! Jai Hind." },
    { name: "Dussehra", date: "2025-10-02", defaultMessage: "Happy Dussehra! May good triumph over evil in your life." },
    { name: "Diwali", date: "2025-10-20", defaultMessage: "Happy Diwali! May the festival of lights brighten your life." }, // Date approx
    { name: "Christmas", date: "2025-12-25", defaultMessage: "Merry Christmas! Wishing you joy and happiness." },
];

export const GreetingService = {

    getTodayGreeting: (company: CompanyProfile): { message: string; type: 'ADMIN' | 'FESTIVAL' | null; title?: string } | null => {
        const todayStr = new Date().toISOString().split('T')[0];

        // 1. Check Admin Greeting (Highest Priority)
        if (company.adminGreeting?.enabled) {
            const expiry = new Date(company.adminGreeting.expiresAt).toISOString().split('T')[0];
            if (todayStr <= expiry) {
                return {
                    message: company.adminGreeting.message,
                    type: 'ADMIN',
                    title: 'Important Message'
                };
            }
        }

        // 2. Check Festival Greeting (If Enabled)
        if (company.greetingSettings?.enableFestivalGreetings) {
            const todayFestival = FESTIVALS_2025.find(f => f.date === todayStr);

            if (todayFestival) {
                // Here we could simulate AI enhancement if toggle is on
                let msg = todayFestival.defaultMessage;
                if (company.greetingSettings.useAiEnhancement) {
                    // Mock AI enhancement
                    msg = `✨ ${todayFestival.name} ✨\n\n${todayFestival.defaultMessage}\n\n– ${company.name}`;
                }

                return {
                    message: msg,
                    type: 'FESTIVAL',
                    title: todayFestival.name
                };
            }
        }

        return null;
    },

    getUpcomingFestivals: (): Festival[] => {
        const todayStr = new Date().toISOString().split('T')[0];
        return FESTIVALS_2025.filter(f => f.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date));
    }
};
