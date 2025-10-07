import { Suspense } from 'react';
import { ShimmerGrid } from '../../components/Shimmer';
import CompactHeader from '../../components/CompactHeader';
import MediaManagementClient from '../../components/MediaManagementClient';

export const dynamic = 'force-dynamic';

export default function MediaAdminPage() {
  return (
    <div className="relative z-10 max-w-7xl mx-auto px-6 pb-12">
      <CompactHeader 
        title="Media Administration"
        subtitle="Administrer mediekilder og deres indstillinger"
      />

      <Suspense fallback={<ShimmerGrid />}>
        <MediaManagementClient />
      </Suspense>
    </div>
  );
}
