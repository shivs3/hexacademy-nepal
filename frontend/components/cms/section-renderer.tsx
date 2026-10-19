import type { Section, SiteSettings } from "@/types/cms";

import {
  CtaSection,
  FeaturesSection,
  ImageTextSection,
  RichTextSection,
  StatsSection,
  TestimonialsSection,
  VideoSection,
} from "./sections/content";
import { HeroSection } from "./sections/hero";
import { ContactSection, FaqSection, NewsletterSection } from "./sections/interactive";

/**
 * Maps each backend section type (apps/cms/sections.py) to its component.
 * Unknown types are skipped so a newer backend never breaks an older frontend.
 */
function renderSection(section: Section, index: number, settings: SiteSettings) {
  const level = index === 0 ? "h1" : "h2";
  switch (section.type) {
    case "hero":
      return <HeroSection data={section.data} first={index === 0} />;
    case "rich_text":
      return <RichTextSection data={section.data} level={level} />;
    case "features":
      return <FeaturesSection data={section.data} level={level} />;
    case "testimonials":
      return <TestimonialsSection data={section.data} level={level} />;
    case "faq":
      return <FaqSection data={section.data} level={level} />;
    case "stats":
      return <StatsSection data={section.data} level={level} />;
    case "image_text":
      return <ImageTextSection data={section.data} level={level} />;
    case "video":
      return <VideoSection data={section.data} level={level} />;
    case "cta":
      return <CtaSection data={section.data} level={level} />;
    case "newsletter":
      return <NewsletterSection data={section.data} level={level} />;
    case "contact":
      return <ContactSection data={section.data} settings={settings} level={level} />;
    default:
      return null;
  }
}

export function SectionRenderer({ sections, settings }: { sections: Section[]; settings: SiteSettings }) {
  return (
    <>
      {sections.map((section, index) => (
        <div key={section.id} data-section-type={section.type}>
          {renderSection(section, index, settings)}
        </div>
      ))}
    </>
  );
}
