import type { Config } from 'tailwindcss';

export default {
  content: [
    './app/**/*.{ts,tsx,js,jsx,mdx}',
    './components/**/*.{ts,tsx,js,jsx}',
    './pages/**/*.{ts,tsx,js,jsx}',
  ],
  darkMode: 'class',
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: '1rem', md: '1.5rem' },
      screens: { '2xl': '1200px' },
    },
    extend: {
      colors: {
        ink: '#0A0A0A',
        paper: '#FAFAFA',
        line: '#E5E7EB',
        textMuted: '#6B7280',
      },
      borderRadius: {
        '2xl': '1rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.06)',
        'card-hover': '0 4px 14px rgba(0,0,0,0.08)',
      },
      fontFamily: {
        sans: [
          'ui-sans-serif','system-ui','-apple-system','Segoe UI','Roboto',
          'Helvetica Neue','Arial','Noto Sans','sans-serif',
        ],
        mono: ['ui-monospace','SFMono-Regular','Menlo','monospace'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    require('@tailwindcss/line-clamp'),
  ],
} satisfies Config;


