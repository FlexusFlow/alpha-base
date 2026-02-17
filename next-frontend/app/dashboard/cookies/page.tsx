import { CookieManagement } from "@/components/cookie-management";

export default function CookiesPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cookies</h1>
        <p className="text-muted-foreground">
          Manage browser cookie files for accessing paywalled content during scraping.
        </p>
      </div>
      <CookieManagement />
    </div>
  );
}
