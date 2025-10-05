// Performance monitoring utilities
export const performanceMonitor = {
  // Measure component render time
  measureRender: (componentName: string, fn: () => void) => {
    if (typeof window !== 'undefined' && 'performance' in window) {
      const start = performance.now();
      fn();
      const end = performance.now();
      console.log(`${componentName} render time: ${(end - start).toFixed(2)}ms`);
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
      console.log(`${apiName} API call time: ${(end - start).toFixed(2)}ms`);
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
        console.log(`Image load time for ${imageUrl}: ${(end - start).toFixed(2)}ms`);
      };
      img.src = imageUrl;
    }
  }
};

// Web Vitals monitoring
export const reportWebVitals = (metric: any) => {
  if (typeof window !== 'undefined' && 'performance' in window) {
    console.log('Web Vitals:', metric);
    
    // Send to analytics service in production
    if (process.env.NODE_ENV === 'production') {
      // Example: send to Google Analytics, Vercel Analytics, etc.
      // gtag('event', metric.name, {
      //   value: Math.round(metric.value),
      //   event_label: metric.id,
      //   non_interaction: true,
      // });
    }
  }
};
