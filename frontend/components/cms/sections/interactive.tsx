import { ChevronDown, Mail, MapPin, Phone } from "lucide-react";

import { JsonLd } from "@/components/cms/json-ld";
import { richTextToPlain } from "@/lib/rich-text";
import type { SectionDataMap, SiteSettings } from "@/types/cms";

import { RichText } from "../rich-text";
import { NewsletterForm } from "./newsletter-form";
import { type HeadingLevel, SectionContainer, SectionHeading } from "./shared";

export function FaqSection({ data, level }: { data: SectionDataMap["faq"]; level?: HeadingLevel }) {
  return (
    <SectionContainer inner="max-w-3xl">
      <SectionHeading heading={data.heading} intro={data.intro} level={level} />
      <div className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-white">
        {data.items.map((item, i) => (
          <details key={i} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-semibold text-navy hover:bg-page [&::-webkit-details-marker]:hidden">
              {item.question}
              <ChevronDown className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <RichText html={item.answer} className="px-5 pb-5 text-[0.95rem]" />
          </details>
        ))}
      </div>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: data.items.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: { "@type": "Answer", text: richTextToPlain(item.answer) },
          })),
        }}
      />
    </SectionContainer>
  );
}

export function NewsletterSection({ data, level = "h2" }: { data: SectionDataMap["newsletter"]; level?: HeadingLevel }) {
  const H = level;
  return (
    <SectionContainer tone="white">
      <div className="mx-auto grid max-w-5xl gap-8 rounded-[var(--radius-card)] border border-line bg-page p-6 sm:p-10 lg:grid-cols-2 lg:items-center">
        <div>
          <H className="text-2xl font-bold sm:text-3xl">{data.heading}</H>
          {data.text && <p className="mt-2 text-muted">{data.text}</p>}
        </div>
        <NewsletterForm buttonLabel={data.button_label || "Subscribe"} consentText={data.consent_text} />
      </div>
    </SectionContainer>
  );
}

export function ContactSection({
  data,
  settings,
  level,
}: {
  data: SectionDataMap["contact"];
  settings: SiteSettings;
  level?: HeadingLevel;
}) {
  const rows = [
    data.show_email && settings.contact_email
      ? { icon: Mail, label: "Email", value: settings.contact_email, href: `mailto:${settings.contact_email}` }
      : null,
    data.show_phone && settings.contact_phone
      ? { icon: Phone, label: "Phone", value: settings.contact_phone, href: `tel:${settings.contact_phone.replace(/\s/g, "")}` }
      : null,
    data.show_address && settings.address ? { icon: MapPin, label: "Address", value: settings.address, href: null } : null,
  ].filter((r) => r !== null);

  return (
    <SectionContainer inner="max-w-4xl">
      <SectionHeading heading={data.heading} intro={data.intro} center={false} level={level} />
      <div className="grid gap-8 md:grid-cols-[minmax(0,20rem)_1fr]">
        {rows.length > 0 ? (
          <dl className="flex flex-col gap-4">
            {rows.map(({ icon: Icon, label, value, href }) => (
              <div key={label} className="flex gap-3 rounded-[var(--radius-card)] border border-line bg-white p-4">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-teal" aria-hidden="true" />
                <div className="min-w-0">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
                  <dd className="mt-0.5 whitespace-pre-line break-words text-navy">
                    {href ? (
                      <a href={href} className="hover:text-teal-700 hover:underline">
                        {value}
                      </a>
                    ) : (
                      value
                    )}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted">Contact details have not been published yet.</p>
        )}
        {data.extra && <RichText html={data.extra} />}
      </div>
    </SectionContainer>
  );
}
