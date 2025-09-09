# Deployment Guide - Apropos Research

## Prerequisites
- Node.js 18+ installed
- Vercel account (free tier available)
- Git repository

## Deployment Steps

### 1. Prepare for Deployment
```bash
# Ensure build works
npm run build

# Test locally
npm run dev
```

### 2. Deploy to Vercel

#### Option A: Vercel CLI
```bash
# Install Vercel CLI globally
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel --prod
```

#### Option B: Vercel Dashboard
1. Go to [vercel.com](https://vercel.com)
2. Click "New Project"
3. Import your Git repository
4. Set build command: `npm run build`
5. Set output directory: `.next`
6. Deploy

### 3. Environment Variables
No environment variables needed for this project.

### 4. Custom Domain (Optional)
- Go to Vercel dashboard
- Select your project
- Go to Settings > Domains
- Add your custom domain

## Build Configuration
- **Framework**: Next.js
- **Build Command**: `npm run build`
- **Output Directory**: `.next`
- **Install Command**: `npm install`

## Features Included
- ✅ Responsive design
- ✅ Dark/Light mode
- ✅ Search functionality
- ✅ Category filtering
- ✅ Multi-select with bulk actions
- ✅ Editorial Queue
- ✅ AI Drafts
- ✅ Glass morphism UI
- ✅ Shimmer loading effects
- ✅ Image optimization
- ✅ SEO optimized

## Troubleshooting

### Build Errors
- Ensure all dependencies are installed: `npm install`
- Clear cache: `rm -rf .next && npm run build`
- Check for TypeScript errors: `npm run build`

### Runtime Errors
- Check browser console for errors
- Verify all API routes are working
- Test image loading

### Performance
- Images are optimized with Next.js Image component
- Static pages are pre-rendered
- Dynamic pages use server-side rendering

## Support
For issues or questions, check the project documentation or contact the development team.
