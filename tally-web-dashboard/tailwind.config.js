/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: '#4A90D9',
                secondary: '#1F2937',
                success: '#10B981',
                warning: '#F59E0B',
                danger: '#EF4444',
                surface: '#FFFFFF',
                bg: '#F3F4F6'
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
            }
        },
    },
    plugins: [],
}
