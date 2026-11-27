// Vite config: React plugin, dev server port, and the "@" alias (@ = src) used by imports and shadcn/React Bits
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  // The Floci build sets VITE_BASE=./ so the built files load from the S3 bucket's folder
  // (http://localhost:4566/officeours-web/...). Local dev and normal builds keep "/".
  base: process.env.VITE_BASE || '/',
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5173 },
  // Vite 8 dev can pre-bundle libraries in separate passes, each with its own copy of React, which crashes
  // every page with "Invalid hook call". Listing them here bundles them together in one pass with a single React.
  optimizeDeps: {
    include: [
      'react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime',
      'react-router-dom', 'lucide-react', 'motion/react', 'three',
    ],
  },
});
