/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
    theme: {
        extend: {
            colors: {
                primary: {
                    50: '#eef4ff',
                    100: '#dbe7ff',
                    200: '#bfd3ff',
                    300: '#92b6ff',
                    400: '#5f95f2',
                    500: '#2c6fd6',
                    600: '#0f4fa8',
                    700: '#002d62',
                    800: '#001f45',
                    900: '#0a1731',
                },
                accent: {
                    50: '#fff1f2',
                    100: '#ffe4e6',
                    200: '#fecdd3',
                    300: '#fda4af',
                    400: '#fb7185',
                    500: '#e33a51',
                    600: '#ce1126',
                    700: '#a90f21',
                    800: '#8a1020',
                    900: '#4b0a13',
                },
                dominican: {
                    red: '#CE1126',
                    blue: '#002D62',
                    white: '#FFFFFF',
                },
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
                display: ['Outfit', 'sans-serif'],
            },
            animation: {
                'fade-in': 'fadeIn 0.5s ease-out',
                'slide-up': 'slideUp 0.5s ease-out',
                'slide-down': 'slideDown 0.3s ease-out',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                slideUp: {
                    '0%': { opacity: '0', transform: 'translateY(20px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                slideDown: {
                    '0%': { opacity: '0', transform: 'translateY(-10px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
            },
        },
    },
    plugins: [],
};
