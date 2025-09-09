/** @type {import('next').NextConfig} */
const nextConfig = {
  // App directory is now stable in Next.js 15
  trailingSlash: false,
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
    ],
  },
}

module.exports = nextConfig
