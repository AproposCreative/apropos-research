const { version } = require('./package.json');
const { execSync } = require('node:child_process');

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
function readGitShortSha() {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

function readGitDirtyFlag() {
  try {
    const output = execSync('git status --porcelain', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    return output.length > 0 ? 'dirty' : '';
  } catch {
    return '';
  }
}

const vercelSha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || '';
const localSha = readGitShortSha() || '';
const buildId = process.env.NEXT_PUBLIC_BUILD_ID || vercelSha || localSha || 'local';
const dirtySuffix = !vercelSha && localSha && readGitDirtyFlag() ? '.dirty' : '';
const autoBuildLabel = `${version}.${buildId}${dirtySuffix}`;
const buildLabel = process.env.NEXT_PUBLIC_BUILD_LABEL || autoBuildLabel;

const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_BUILD_ID: buildId,
    NEXT_PUBLIC_BUILD_LABEL: buildLabel,
  },
  // Simplified config to fix client-side rendering issues
  reactStrictMode: false,
  
  // Disable ESLint during builds (we run it separately)
  eslint: {
    ignoreDuringBuilds: true,
  },
  
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
