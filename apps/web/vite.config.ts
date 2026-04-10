import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules')) {
                        if (id.includes('leaflet') || id.includes('react-leaflet')) {
                            return 'vendor-maps';
                        }
                        if (id.includes('@tanstack/react-query') || id.includes('axios')) {
                            return 'vendor-data';
                        }
                        if (id.includes('react-router-dom')) {
                            return 'vendor-router';
                        }
                        if (
                            id.includes('/react/')
                            || id.includes('\\react\\')
                            || id.includes('/react-dom/')
                            || id.includes('\\react-dom\\')
                            || id.includes('/scheduler/')
                            || id.includes('\\scheduler\\')
                        ) {
                            return 'vendor-react';
                        }
                    }

                    if (
                        id.includes('/src/pages/AdminDashboard')
                        || id.includes('\\src\\pages\\AdminDashboard')
                    ) {
                        return 'page-admin-dashboard';
                    }

                    if (
                        id.includes('/src/pages/AdminSecurity')
                        || id.includes('\\src\\pages\\AdminSecurity')
                    ) {
                        return 'page-admin-security';
                    }

                    if (
                        id.includes('/src/pages/RegisterBusiness')
                        || id.includes('\\src\\pages\\RegisterBusiness')
                    ) {
                        return 'page-owner-register';
                    }

                    if (
                        id.includes('/src/pages/EditBusiness')
                        || id.includes('\\src\\pages\\EditBusiness')
                    ) {
                        return 'page-owner-edit';
                    }

                    if (
                        id.includes('/src/pages/DashboardBusiness')
                        || id.includes('\\src\\pages\\DashboardBusiness')
                    ) {
                        return 'page-owner-dashboard';
                    }

                    if (
                        id.includes('/src/pages/Home')
                        || id.includes('\\src\\pages\\Home')
                    ) {
                        return 'page-home';
                    }

                    if (
                        id.includes('/src/pages/BusinessesList')
                        || id.includes('\\src\\pages\\BusinessesList')
                    ) {
                        return 'page-discovery';
                    }

                    if (
                        id.includes('/src/pages/BusinessDetails')
                        || id.includes('\\src\\pages\\BusinessDetails')
                        || id.includes('/src/pages/business-details/')
                        || id.includes('\\src\\pages\\business-details\\')
                    ) {
                        return 'page-business-detail';
                    }

                    if (
                        id.includes('/src/pages/Login')
                        || id.includes('\\src\\pages\\Login')
                        || id.includes('/src/pages/Register')
                        || id.includes('\\src\\pages\\Register')
                        || id.includes('/src/pages/ForgotPassword')
                        || id.includes('\\src\\pages\\ForgotPassword')
                        || id.includes('/src/pages/ResetPassword')
                        || id.includes('\\src\\pages\\ResetPassword')
                        || id.includes('/src/components/auth/')
                        || id.includes('\\src\\components\\auth\\')
                    ) {
                        return 'page-auth';
                    }

                    return undefined;
                },
            },
        },
    },
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            },
        },
    },
    test: {
        environment: 'jsdom',
        setupFiles: './src/test/setup.ts',
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
        css: true,
    },
});
