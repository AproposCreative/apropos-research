import AIDrafts from '../../components/AIDrafts';
import CompactHeader from '../../components/CompactHeader';

export default async function AIDraftsPage() {
  return (
    <div className="space-y-6">
      <CompactHeader 
        title="AI Drafts"
        subtitle="Genereret indhold klar til redigering"
      />
      <AIDrafts />
    </div>
  );
}
