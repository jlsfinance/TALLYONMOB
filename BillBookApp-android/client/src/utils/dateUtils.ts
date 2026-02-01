
/**
 * Utility function to format any date string or Date object to DD-MM-YYYY format.
 * Standard format for the Indian accounting context.
 */
export const formatDate = (dateStr: string | Date | undefined | null): string => {
    if (!dateStr) return '';
    try {
        const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
        if (isNaN(date.getTime())) return '';

        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();

        return `${day}-${month}-${year}`;
    } catch (error) {
        console.error('Error formatting date:', error);
        return '';
    }
};
