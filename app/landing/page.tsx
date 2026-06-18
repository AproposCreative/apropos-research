import LandingHero from '@/components/marketing/LandingHero';
import ProductShowcase from '@/components/marketing/ProductShowcase';
import NarrativeProblem from '@/components/marketing/NarrativeProblem';
import PublishedProof from '@/components/marketing/PublishedProof';
import LogoCloud from '@/components/marketing/LogoCloud';
import ProductStoryShowcase from '@/components/marketing/ProductStoryShowcase';
import BentoGrid from '@/components/marketing/BentoGrid';
import LandingCta from '@/components/marketing/LandingCta';
import StatsRow from '@/components/marketing/StatsRow';
import { fetchLandingAssets } from '@/lib/landing/webflow-assets';

export default async function LandingPage() {
  const assets = await fetchLandingAssets();

  return (
    <>
      <LandingHero />
      <ProductShowcase />
      <NarrativeProblem />
      <PublishedProof
        articles={assets.articles}
        articleCount={assets.articleCount}
        magazineUrl={assets.magazineUrl}
      />
      <LogoCloud partnerLogos={assets.partnerLogos} />
      <StatsRow articleCount={assets.articleCount} magazineUrl={assets.magazineUrl} />
      <ProductStoryShowcase />
      <BentoGrid />
      <LandingCta />
    </>
  );
}
