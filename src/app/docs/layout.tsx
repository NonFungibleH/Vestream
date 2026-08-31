import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { DocsSidebar } from "./_components/DocsSidebar";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#f8fafc", color: "#0f172a" }}>
      <SiteNav theme="light" />
      <div className="flex-1 w-full max-w-6xl mx-auto px-4 md:px-8 pt-20 md:pt-24 pb-16 md:pb-24">
        <div className="lg:flex lg:gap-10">
          <DocsSidebar />
          <main className="flex-1 min-w-0 lg:max-w-3xl">{children}</main>
        </div>
      </div>
      <SiteFooter theme="light" />
    </div>
  );
}
