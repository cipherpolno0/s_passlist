import type { NextConfig } from 'next';
const config: NextConfig = {
  serverExternalPackages: ['postgres'],
  experimental: { cpus: 2 },
  async headers() { return [{ source: '/:path*', headers: [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  ] }]; },
};
export default config;
