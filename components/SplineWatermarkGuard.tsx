'use client';

import { useEffect } from 'react';
import { installSplineWatermarkFilter } from '@/lib/spline-hide-watermark';

export default function SplineWatermarkGuard() {
  useEffect(() => installSplineWatermarkFilter(), []);
  return null;
}
