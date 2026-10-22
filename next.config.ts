import type { NextConfig } from 'next';

const config: NextConfig = {
  serverExternalPackages: ['@node-rs/argon2'],
  output: 'standalone',
};

export default config;
