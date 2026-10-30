import toolStyles from '@/components/tool-surface.module.css';
import AIDrafts from '../../components/AIDrafts';
import CompactHeader from '../../components/embedded-app/ToolPageHeader';

export default async function AIDraftsPage() {
  return (
    <div className={`${toolStyles.legacy} p-2 sm:p-3 space-y-3`}>
      <CompactHeader 
        title="AI Drafts"
        subtitle="Genereret indhold klar til redigering"
      />
      <AIDrafts />
    </div>
  );
}
