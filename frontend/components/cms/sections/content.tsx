import {
  Award,
  BookOpen,
  Brain,
  Calculator,
  Calendar,
  ClipboardCheck,
  Clock,
  Code,
  Cpu,
  FileText,
  Globe,
  GraduationCap,
  Headphones,
  Laptop,
  MessageCircle,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { SectionDataMap } from "@/types/cms";

import { MediaImage } from "../media-image";
import { RichText } from "../rich-text";
import { CtaButton, type HeadingLevel, SectionContainer, SectionHeading } from "./shared";

export const FEATURE_ICONS: Record<string, LucideIcon> = {
  "graduation-cap": GraduationCap,
  "book-open": BookOpen,
  video: Video,
  "clipboard-check": ClipboardCheck,
  award: Award,
  users: Users,
  laptop: Laptop,
  brain: Brain,
  code: Code,
  cpu: Cpu,
  calculator: Calculator,
  calendar: Calendar,
  "message-circle": MessageCircle,
  "shield-check": ShieldCheck,
  target: Target,
  "trending-up": TrendingUp,
  globe: Globe,
  clock: Clock,
  "file-text": FileText,
  headphones: Headphones,
};

export function RichTextSection({ data, level = "h2" }: { data: SectionDataMap["rich_text"]; level?: HeadingLevel }) {
  const H = level;
  return (
    <SectionContainer inner={data.width === "wide" ? "max-w-5xl" : "max-w-3xl"}>
      {data.heading && <H className="mb-6 text-3xl font-bold">{data.heading}</H>}
      <RichText html={data.body} className="prose-lg" />
    </SectionContainer>
  );
}

const COLUMNS = { "2": "sm:grid-cols-2", "3": "sm:grid-cols-2 lg:grid-cols-3", "4": "sm:grid-cols-2 lg:grid-cols-4" };

export function FeaturesSection({ data, level = "h2" }: { data: SectionDataMap["features"]; level?: HeadingLevel }) {
  return (
    <SectionContainer>
      <SectionHeading heading={data.heading} intro={data.intro} level={level} />
      <ul className={cn("grid gap-5", COLUMNS[data.columns] ?? COLUMNS["3"])}>
        {data.items.map((item, i) => {
          const Icon = FEATURE_ICONS[item.icon] ?? GraduationCap;
          return (
            <li key={i} className="rounded-[var(--radius-card)] border border-line bg-white p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-teal-50 text-teal">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
              {item.text && <p className="mt-2 text-sm leading-relaxed text-muted">{item.text}</p>}
            </li>
          );
        })}
      </ul>
    </SectionContainer>
  );
}

export function TestimonialsSection({ data, level = "h2" }: { data: SectionDataMap["testimonials"]; level?: HeadingLevel }) {
  return (
    <SectionContainer tone="white">
      <SectionHeading heading={data.heading} intro={data.intro} level={level} />
      <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {data.items.map((item, i) => (
          <li key={i}>
            <figure className="flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-page p-6">
              <blockquote className="flex-1 text-body leading-relaxed">“{item.quote}”</blockquote>
              <figcaption className="mt-5 flex items-center gap-3">
                {item.photo && (
                  <MediaImage image={item.photo} alt="" className="h-10 w-10 rounded-full object-cover" sizes="40px" />
                )}
                <span>
                  <span className="block text-sm font-semibold text-navy">{item.name}</span>
                  {item.role && <span className="block text-xs text-muted">{item.role}</span>}
                </span>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </SectionContainer>
  );
}

export function StatsSection({ data, level = "h2" }: { data: SectionDataMap["stats"]; level?: HeadingLevel }) {
  return (
    <SectionContainer>
      <SectionHeading heading={data.heading} intro={data.intro} level={level} />
      <dl className="grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(0,1fr))]">
        {data.items.map((item, i) => (
          <div key={i} className="flex flex-col bg-white p-6 text-center">
            <dt className="order-2 mt-1 text-sm font-medium text-muted">{item.label}</dt>
            <dd className="order-1 font-display text-4xl font-bold text-navy">{item.value}</dd>
            {item.note && <dd className="order-3 mt-2 text-xs text-muted">{item.note}</dd>}
          </div>
        ))}
      </dl>
    </SectionContainer>
  );
}

export function ImageTextSection({ data, level = "h2" }: { data: SectionDataMap["image_text"]; level?: HeadingLevel }) {
  const H = level;
  return (
    <SectionContainer>
      <div className="grid items-center gap-10 lg:grid-cols-2">
        {data.image && (
          <div
            className={cn(
              "overflow-hidden rounded-[var(--radius-card)] ring-1 ring-black/5",
              data.image_position === "right" && "lg:order-2",
            )}
          >
            <MediaImage image={data.image} sizes="(min-width: 1024px) 50vw, 100vw" />
          </div>
        )}
        <div>
          <H className="text-3xl font-bold leading-tight">{data.heading}</H>
          {data.body && <RichText html={data.body} className="mt-4" />}
          {data.cta_label && (
            <div className="mt-6">
              <CtaButton label={data.cta_label} url={data.cta_url} />
            </div>
          )}
        </div>
      </div>
    </SectionContainer>
  );
}

export function VideoSection({ data, level = "h2" }: { data: SectionDataMap["video"]; level?: HeadingLevel }) {
  if (!data.video_url) return null;
  return (
    <SectionContainer inner="max-w-4xl">
      <SectionHeading heading={data.heading} intro={data.intro} level={level} />
      <figure>
        <div className="aspect-video overflow-hidden rounded-[var(--radius-card)] bg-navy shadow-lg">
          <iframe
            src={data.video_url.embed_url}
            title={data.heading || data.caption || "Embedded video"}
            className="h-full w-full"
            loading="lazy"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          />
        </div>
        {data.caption && <figcaption className="mt-3 text-center text-sm text-muted">{data.caption}</figcaption>}
      </figure>
    </SectionContainer>
  );
}

export function CtaSection({ data, level = "h2" }: { data: SectionDataMap["cta"]; level?: HeadingLevel }) {
  const H = level;
  const tone = data.theme === "light" ? "white" : data.theme === "accent" ? "accent" : "dark";
  const inverted = tone !== "white";
  return (
    <SectionContainer tone={tone} inner="max-w-4xl text-center">
      <H className={cn("text-3xl font-bold leading-tight sm:text-4xl", inverted && "text-white")}>{data.heading}</H>
      {data.text && <p className={cn("mx-auto mt-3 max-w-2xl text-lg", inverted ? "text-white/80" : "text-muted")}>{data.text}</p>}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <CtaButton label={data.button_label} url={data.button_url} variant={inverted ? "inverted" : "primary"} />
        <CtaButton
          label={data.secondary_label}
          url={data.secondary_url}
          variant="outline"
          className={inverted ? "border-white/40 bg-transparent text-white hover:bg-white/10" : undefined}
        />
      </div>
    </SectionContainer>
  );
}
