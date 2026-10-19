import { PublicChrome } from "@/components/cms/public-chrome";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <PublicChrome>{children}</PublicChrome>;
}
