import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, workspaceRoot, [
    'WEB_HOST',
    'WEB_PORT',
    'API_PROXY_TARGET',
  ]);
  const host = env['WEB_HOST'] || '127.0.0.1';
  const port = env['WEB_PORT'] ? Number(env['WEB_PORT']) : undefined;

  if (
    port !== undefined &&
    (!Number.isInteger(port) || port < 1 || port > 65535)
  ) {
    throw new Error('WEB_PORT debe ser un número entero entre 1 y 65535.');
  }

  const proxy = {
    '/api': {
      target: env['API_PROXY_TARGET'] || 'http://127.0.0.1:3000',
    },
  };

  return {
    plugins: [react(), tailwindcss()],
    server: { host, port: port ?? 5173, strictPort: true, proxy },
    preview: { host, port: port ?? 4173, strictPort: true, proxy },
  };
});
