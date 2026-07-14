/**
 * Reusable utility to export JSON data to CSV and download it
 */
export function exportToCSV(data: any[], headers: { key: string; label: string }[], filename: string) {
    if (!data || data.length === 0) {
        return;
    }

    // Header row
    const headerRow = headers.map(h => `"${h.label.replace(/"/g, '""')}"`).join(',');

    // Data rows
    const dataRows = data.map(row => {
        return headers.map(h => {
            let val = row[h.key];
            if (val === undefined || val === null) {
                val = '';
            } else if (typeof val === 'object') {
                val = JSON.stringify(val);
            } else {
                val = String(val);
            }
            // Escape double quotes
            return `"${val.replace(/"/g, '""')}"`;
        }).join(',');
    });

    const csvContent = '\uFEFF' + [headerRow, ...dataRows].join('\n'); // Add BOM for Excel UTF-8 compliance
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
