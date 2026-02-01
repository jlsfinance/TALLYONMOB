
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export const HapticService = {
    impact: async (style: ImpactStyle = ImpactStyle.Light) => {
        try {
            await Haptics.impact({ style });
        } catch (e) {
            console.warn('Haptics not available');
        }
    },
    notification: async (_type: 'success' | 'error' = 'success') => {
        try {
            // Mapping or direct call
            await Haptics.vibrate();
        } catch (e) {
            console.warn('Haptics not available');
        }
    },
    light: () => HapticService.impact(ImpactStyle.Light),
    medium: () => HapticService.impact(ImpactStyle.Medium),
    heavy: () => HapticService.impact(ImpactStyle.Heavy),
    success: () => HapticService.notification('success'),
    error: () => HapticService.notification('error'),
    selection: async () => {
        try {
            await Haptics.selectionChanged();
        } catch (e) {
            console.warn('Haptics not available');
        }
    },
};
