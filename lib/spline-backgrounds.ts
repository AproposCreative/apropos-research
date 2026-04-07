export const STORAGE_KEY_SPLINE_BG = 'apropos-spline-background';

export const SPLINE_BACKGROUNDS = [
  {
    id: 'robot',
    name: 'Robot Karakter',
    url: 'https://my.spline.design/nexbotrobotcharacterconcept-jOiWdJXA0mBgb50nmYl1x0EC/',
    description: 'Moderne AI-assistent robot',
  },
  {
    id: 'gradient',
    name: 'Gradient Animation',
    url: 'https://my.spline.design/animatedbackgroundgradientforweb-k9vy84HznMWrADyOW44KZ3Ue/',
    description: 'Abstrakt gradient flow',
  },
  {
    id: 'retrofuturism',
    name: 'Retro Futurism',
    url: 'https://my.spline.design/retrofuturismbganimation-Z5NWhPCGc1tcryNEnaN2FnIJ/',
    description: 'Retro futuristisk animation',
  },
  {
    id: 'dotwaves',
    name: 'Dot Waves',
    url: 'https://my.spline.design/dotwaves-h4iKKFVRORZbPRboUfG4QKRk/',
    description: 'Pulserende dot waves',
  },
  {
    id: 'black-particles',
    name: 'Black Particles 🌑',
    url: 'https://my.spline.design/blackparticles-t7yFXQqAzE4DZVcoSbjisK2f/',
    description: 'Sort partikel animation',
  },
] as const;

export type SplineBackgroundId = (typeof SPLINE_BACKGROUNDS)[number]['id'];
