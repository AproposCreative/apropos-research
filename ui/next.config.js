/** @type {import('next').NextConfig} */
const nextConfig = {
  // App directory is now stable in Next.js 15
  trailingSlash: false,
  // Fix Fast Refresh issues with multiple lockfiles
  outputFileTracingRoot: __dirname,
  // Improve Fast Refresh performance
  experimental: {
    optimizePackageImports: ['@/components', '@/lib'],
    // Disable problematic features that cause Fast Refresh issues
    esmExternals: false,
    serverComponentsExternalPackages: [],
    // Disable Fast Refresh entirely to prevent issues
    fastRefresh: false,
  },
  // Disable features that can cause Fast Refresh issues
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  // Force Fast Refresh to work properly
  reactStrictMode: false,
  // Disable Fast Refresh warnings and prevent server crashes
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },
  // Performance optimizations
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  // Add timeout and error handling
  serverRuntimeConfig: {
    timeout: 10000, // 10 seconds
  },
  // Enhanced webpack config for better Fast Refresh
  webpack: (config, { dev, isServer }) => {
    if (dev) {
      // Disable problematic optimizations in development
      config.optimization.splitChunks = false;
      config.optimization.minimize = false;
      config.optimization.moduleIds = 'named';
      config.optimization.chunkIds = 'named';
      
      // Better module resolution for Fast Refresh
      config.resolve.symlinks = false;
      config.resolve.cacheWithContext = false;
      
      // Disable persistent caching that can cause issues
      config.cache = false;
      
      // Force Fast Refresh to work
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
        ignored: /node_modules/,
      };
      
      // Disable problematic plugins
      config.plugins = config.plugins.filter(plugin => {
        return !plugin.constructor.name.includes('HotModuleReplacement');
      });
    }
    
    // Suppress image warnings
    config.infrastructureLogging = {
      level: 'error',
    };
    
    // Suppress Next.js image warnings
    config.plugins = config.plugins.map(plugin => {
      if (plugin.constructor.name === 'NextImageOptimizationPlugin') {
        plugin.options = {
          ...plugin.options,
          disableStaticImages: false,
        };
      }
      return plugin;
    });
    
    return config;
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

module.exports = nextConfig
