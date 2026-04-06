import { teamConfig } from '@/lib/team-config';
import { Navbar } from '@/components/ui/Navbar';
import { HeroSection } from '@/components/landing/HeroSection';
import { FeaturesSection } from '@/components/landing/FeaturesSection';
import { ScheduleSection } from '@/components/landing/ScheduleSection';
import { CTASection } from '@/components/landing/CTASection';
import { Footer } from '@/components/landing/Footer';

export default function Home() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        <HeroSection />
        <FeaturesSection />
        <ScheduleSection />
        <CTASection />
      </main>
      <Footer />
    </>
  );
}
