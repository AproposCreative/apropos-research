// Performance monitoring utilities
import { logger } from './logger';
import { config } from './config/env';

export const performanceMonitor = {
  // Measure component render time
  measureRender: (componentName: string, fn: () => void) => {
    if (typeof window !== 'undefined' && 'performance' in window) {
      const start = performance.now();
      fn();
      const end = performance.now();
      const duration = end - start;
      logger.performance(`${componentName} render`, duration, { componentName });
    } else {
      fn();
    }
  },

  // Measure API call performance
  measureApiCall: async (apiName: string, fn: () => Promise<any>) => {
    if (typeof window !== 'undefined' && 'performance' in window) {
      const start = performance.now();
      const result = await fn();
      const end = performance.now();
      const duration = end - start;
      logger.performance(`${apiName} API call`, duration, { apiName });
      return result;
    } else {
      return await fn();
    }
  },

  // Measure image load time
  measureImageLoad: (imageUrl: string) => {
    if (typeof window !== 'undefined' && 'performance' in window) {
      const start = performance.now();
      const img = new Image();
      img.onload = () => {
        const end = performance.now();
        const duration = end - start;
        logger.performance('Image load', duration, { imageUrl: imageUrl.substring(0, 100) });
      };
      img.src = imageUrl;
    }
  }
};

// Web Vitals monitoring
export const reportWebVitals = (metric: any) => {
  if (typeof window !== 'undefined' && 'performance' in window) {
    logger.performance('Web Vitals', metric.value, {
      metric: metric.name,
      id: metric.id,
    });
    
    // Send to analytics service in production
    if (config.isProduction) {
      // Example: send to Google Analytics, Vercel Analytics, etc.
      // gtag('event', metric.name, {
      //   value: Math.round(metric.value),
      //   event_label: metric.id,
      //   non_interaction: true,
      // });
    }
  }
};
