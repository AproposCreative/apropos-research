'use client';

import { useEffect, useRef, useState } from 'react';
import { Application } from '@splinetool/runtime';

interface SplineAnimationProps {
  sceneUrl: string;
  className?: string;
  style?: React.CSSProperties;
}

export default function SplineAnimation({ 
  sceneUrl, 
  className = '', 
  style = {} 
}: SplineAnimationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<Application | null>(null);
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (canvasRef.current && !hasError) {
      const canvas = canvasRef.current;
      
      // Try different URL formats
      const tryUrls = [
        sceneUrl,
        sceneUrl.replace('/scene.splinecode', ''),
        `https://prod.spline.design/${sceneUrl.split('/').pop()}`,
        sceneUrl.replace('prod.spline.design', 'my.spline.design')
      ];
      
      const initSpline = async () => {
        for (const url of tryUrls) {
          try {
            console.log(`Trying Spline URL: ${url}`);
            
            // Create new application instance
            const app = new Application(canvas);
            appRef.current = app;
            
            // Set initial size
            const rect = canvas.getBoundingClientRect();
            app.setSize(rect.width, rect.height);
            
            // Try to load with this URL
            await app.load(url);
            console.log(`✅ Spline scene loaded successfully with URL: ${url}`);
            setIsLoading(false);
            return; // Success, exit the loop
            
          } catch (error) {
            console.error(`❌ Failed to load with URL: ${url}`, error);
            if (appRef.current) {
              try {
                appRef.current.dispose();
              } catch (disposeError) {
                console.error('Error disposing failed app:', disposeError);
              }
            }
          }
        }
        
        // If we get here, all URLs failed
        console.error('All Spline URLs failed');
        setHasError(true);
      };

      // Handle resize
      const handleResize = () => {
        if (appRef.current && canvas) {
          const rect = canvas.getBoundingClientRect();
          appRef.current.setSize(rect.width, rect.height);
        }
      };

      window.addEventListener('resize', handleResize);
      initSpline();

      return () => {
        window.removeEventListener('resize', handleResize);
        if (appRef.current) {
          try {
            appRef.current.dispose();
          } catch (error) {
            console.error('Error disposing Spline:', error);
          }
        }
      };
    }
  }, [sceneUrl, hasError]);

  // Loading state
  if (isLoading && !hasError) {
    return (
      <div className={`w-full h-full flex items-center justify-center ${className}`} style={style}>
        <div className="text-center text-white/60">
          <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-full flex items-center justify-center animate-pulse">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <p className="text-sm">Loading Robot...</p>
          <p className="text-xs text-white/40 mt-1">AI Assistant</p>
        </div>
      </div>
    );
  }

  // Fallback component if Spline fails to load
  if (hasError) {
    return (
      <div className={`w-full h-full flex items-center justify-center ${className}`} style={style}>
        <div className="text-center text-white/60">
          <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <p className="text-sm">AI Writer</p>
          <p className="text-xs text-white/40 mt-1">Creative Studio</p>
        </div>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-full ${className}`}
      style={{
        background: 'transparent',
        ...style
      }}
    />
  );
}
