'use client';

import { useEffect } from 'react';

export default function PerformanceMonitor() {
  useEffect(() => {
    // Only run in production
    if (process.env.NODE_ENV !== 'production') return;

    // Web Vitals monitoring
    const reportWebVitals = (metric: any) => {
      // Send to analytics service (replace with your preferred service)
      console.log('Web Vital:', metric);
      
      // Example: Send to Google Analytics
      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', metric.name, {
          value: Math.round(metric.value),
          event_category: 'Web Vitals',
          event_label: metric.id,
          non_interaction: true,
        });
      }
    };

    // Web Vitals monitoring (disabled for now due to React 19 compatibility)
    // TODO: Re-enable when web-vitals is compatible with React 19
    /*
    if (process.env.NODE_ENV === 'production') {
      import('web-vitals').then((webVitals: any) => {
        try {
          if (webVitals.getCLS) webVitals.getCLS(reportWebVitals);
          if (webVitals.getFID) webVitals.getFID(reportWebVitals);
          if (webVitals.getFCP) webVitals.getFCP(reportWebVitals);
          if (webVitals.getLCP) webVitals.getLCP(reportWebVitals);
          if (webVitals.getTTFB) webVitals.getTTFB(reportWebVitals);
        } catch (error) {
          console.warn('Web Vitals failed to initialize:', error);
        }
      }).catch((error) => {
        console.warn('Failed to load web-vitals:', error);
      });
    }
    */

    // Memory usage monitoring
    const logMemoryUsage = () => {
      try {
        if ('memory' in performance) {
          const memory = (performance as any).memory;
          console.log('Memory usage:', {
            used: Math.round(memory.usedJSHeapSize / 1048576) + ' MB',
            total: Math.round(memory.totalJSHeapSize / 1048576) + ' MB',
            limit: Math.round(memory.jsHeapSizeLimit / 1048576) + ' MB',
          });
        }
      } catch (error) {
        console.warn('Memory monitoring failed:', error);
      }
    };

    // Log memory usage every 30 seconds
    const memoryInterval = setInterval(logMemoryUsage, 30000);

    return () => {
      clearInterval(memoryInterval);
    };
  }, []);

  return null;
}
