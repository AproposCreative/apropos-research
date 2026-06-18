'use client';

import dynamic from 'next/dynamic';
import { SPLINE_BACKGROUNDS, type SplineBackgroundId } from '@/lib/spline-backgrounds';

const SplineAnimation = dynamic(() => import('@/components/SplineAnimation'), { ssr: false });

function sceneUrl(id: SplineBackgroundId = 'retrofuturism'): string {
  return SPLINE_BACKGROUNDS.find((b) => b.id === id)?.url ?? SPLINE_BACKGROUNDS[2].url;
}

type Props = {
  splineId?: SplineBackgroundId;
  className?: string;
  opacity?: number;
};

export default function SplineHeroBackdrop({
  splineId = 'retrofuturism',
  className = '',
  opacity = 0.55,
}: Props) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      style={{ opacity }}
      aria-hidden
    >
      <SplineAnimation
        sceneUrl={sceneUrl(splineId)}
        className="w-full h-full min-h-[520px]"
        style={{ width: '100%', height: '100%' }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(8,9,10,0.15) 0%, var(--research-canvas) 88%)',
        }}
      />
    </div>
  );
}
