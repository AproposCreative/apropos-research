'use client';

import { useEffect, useRef, useState } from 'react';

export default function SplineTest() {
  const [status, setStatus] = useState('Testing...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const testSpline = async () => {
      try {
        // Test if Spline runtime is available
        const { Application } = await import('@splinetool/runtime');
        setStatus('Spline runtime loaded ✅');
        
        // Test URL accessibility
        const testUrl = 'https://prod.spline.design/nexbotrobotcharacterconcept-jOiWdJXA0mBgb50nmYl1x0EC/scene.splinecode';
        
        const response = await fetch(testUrl, { method: 'HEAD' });
        if (response.ok) {
          setStatus('URL accessible ✅ - Spline should work!');
        } else {
          setError(`URL not accessible: ${response.status}`);
        }
      } catch (err) {
        setError(`Error: ${err}`);
      }
    };

    testSpline();
  }, []);

  return (
    <div className="fixed top-4 right-4 bg-black/80 text-white p-4 rounded-lg z-50 max-w-sm">
      <h3 className="font-bold mb-2">Spline Test</h3>
      <p className="text-sm">{status}</p>
      {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
    </div>
  );
}
