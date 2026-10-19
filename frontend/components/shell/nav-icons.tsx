import {
  Award,
  BookOpen,
  CalendarClock,
  ClipboardCheck,
  CreditCard,
  FileText,
  Gauge,
  Image as ImageIcon,
  LayoutDashboard,
  Mail,
  Menu as MenuIcon,
  Newspaper,
  PanelsTopLeft,
  ScrollText,
  Settings,
  ShieldCheck,
  User,
  Users,
} from "lucide-react";

/**
 * Nav items are built in server components and passed to the client shell,
 * so icons are referenced by name (component functions are not serialisable).
 */
const icons = {
  dashboard: LayoutDashboard,
  courses: BookOpen,
  live: CalendarClock,
  exams: ClipboardCheck,
  certificates: Award,
  orders: CreditCard,
  profile: User,
  users: Users,
  pages: FileText,
  website: PanelsTopLeft,
  blog: Newspaper,
  menus: MenuIcon,
  newsletter: Mail,
  media: ImageIcon,
  settings: Settings,
  audit: ScrollText,
  analytics: Gauge,
  security: ShieldCheck,
} as const;

export type NavIconName = keyof typeof icons;

export function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  const Icon = icons[name];
  return <Icon className={className} aria-hidden="true" />;
}
