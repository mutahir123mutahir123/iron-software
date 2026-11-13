import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function Gate({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect("/login");
  }

  return <>{children}</>;
}

export default function AuthGate({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center p-10 text-sm text-zinc-500">
          Loading…
        </div>
      }
    >
      <Gate>{children}</Gate>
    </Suspense>
  );
}
