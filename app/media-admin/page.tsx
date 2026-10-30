import toolStyles from '@/components/tool-surface.module.css';
import { Suspense } from 'react';
import { ShimmerGrid } from '../../components/Shimmer';
import CompactHeader from '../../components/embedded-app/ToolPageHeader';
import MediaManagementClient from '../../components/MediaManagementClient';

export const dynamic = 'force-dynamic';

export default function MediaAdminPage() {
  return (
    <div className={`${toolStyles.legacy} relative z-10 max-w-7xl mx-auto p-2 sm:p-3`}>
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
