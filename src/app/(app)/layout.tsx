import type { ReactNode } from "react";
import AuthGate from "@/components/auth-gate";
import AppShell from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";

// Every route in this segment reads the session cookie and per-user data;
// there is no static shell worth prerendering. Opt out of instant-navigation
// validation so the segment blocks on the server like a normal dynamic app.
export const instant = false;

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let businessName = "Iron Merchant";
  if (user) {
    const { data } = await supabase
      .from("business_settings")
      .select("business_name")
      .eq("owner_id", user.id)
      .maybeSingle();
    businessName = data?.business_name ?? businessName;
  }

  return (
    <AuthGate>
      <AppShell businessName={businessName}>{children}</AppShell>
    </AuthGate>
  );
}
