let withBundleAnalyzer;
try {
  withBundleAnalyzer = require('@next/bundle-analyzer')({
    enabled: process.env.ANALYZE === 'true',
  });
} catch (error) {
  console.warn('Bundle analyzer not available:', error.message);
  withBundleAnalyzer = (config) => config;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Simplified config to fix client-side rendering issues
  reactStrictMode: false,
  
  // Disable experimental features that might cause issues
  experimental: {
    // Remove optimizePackageImports as it can cause hydration issues
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'soundvenue.com',
        port: '',
        pathname: '/wp-content/uploads/**',
      },
      {
        protocol: 'https',
        hostname: 'gaffa.blob.core.windows.net',
        port: '',
        pathname: '/gaffa-media/**',
      },
      {
        protocol: 'https',
        hostname: 'akamai-aptoma-production.bmcdn.dk',
        port: '',
        pathname: '/users/**',
      },
      {
        protocol: 'https',
        hostname: 'bt.bmcdn.dk',
        port: '',
        pathname: '/media/**',
      },
      {
        protocol: 'https',
        hostname: 'www.bt.dk',
        port: '',
        pathname: '/build/images/**',
      },
      {
        protocol: 'https',
        hostname: 'berlingske.dk',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'dr.dk',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.berlingske.dk',
        port: '',
        pathname: '/**',
      },
    ],
    // Allow query strings for image proxy
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    // Disable image optimization warnings
    unoptimized: false,
    loader: 'default',
  },
}

module.exports = withBundleAnalyzer(nextConfig)
