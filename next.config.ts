import type { NextConfig } from 'next';

const config: NextConfig = {
  serverExternalPackages: ['@node-rs/argon2', 'zxing-wasm'],
  output: 'standalone',
  // zxing-wasm laadt zijn .wasm via een pad dat Next niet kan volgen; daarom expliciet meenemen.
  outputFileTracingIncludes: {
    '/api/**': ['./node_modules/zxing-wasm/dist/full/zxing_full.wasm'],
  },
};

export default config;
