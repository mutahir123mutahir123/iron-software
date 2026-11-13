import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function auditLog(
  supabase: SupabaseServerClient,
  action: string,
  tableName: string,
  recordId: string | null,
  details?: Record<string, unknown>,
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase.from("audit_logs").insert({
    owner_id: user.id,
    actor: user.id,
    action,
    table_name: tableName,
    record_id: recordId,
    details: details ?? null,
  });

  if (error) {
    console.error("audit_logs insert failed:", error.message);
  }
}
