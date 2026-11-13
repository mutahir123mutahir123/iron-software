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
      <div className="flex flex-1 items-center justify-center p-10">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-outline-soft border-t-forest"
          role="status"
          aria-label="Loading"
        />
      </div>
    );
  }

  return <>{children}</>;
}
