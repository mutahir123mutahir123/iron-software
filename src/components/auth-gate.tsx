"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth
      .getUser()
      .then(({ data, error }) => {
        if (error || !data.user) {
          router.replace("/login");
          return;
        }
        setIsAuthorized(true);
      })
      .catch(() => {
        router.replace("/login");
      });
  }, [router]);

  if (!isAuthorized) {
    return (
      <div className="flex flex-1 items-center justify-center p-10 text-sm text-zinc-500">
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}
