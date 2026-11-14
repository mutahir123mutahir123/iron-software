"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { auditLog } from "@/server/audit";

export type SupplierFormState = { error: string | null };

function parseSupplierForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const address = String(formData.get("address") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!name) return { error: "Supplier name is required." } as const;

  return { values: { name, phone, address, notes } } as const;
}

export async function createSupplier(
  _prevState: SupplierFormState,
  formData: FormData,
): Promise<SupplierFormState> {
  const parsed = parseSupplierForm(formData);
  if ("error" in parsed) return { error: parsed.error ?? "Invalid input." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data, error } = await supabase
    .from("suppliers")
    .insert({ owner_id: user.id, ...parsed.values })
    .select("id")
    .single();

  if (error) return { error: "Could not create the supplier. Please try again." };

  await auditLog(supabase, "create", "suppliers", data.id, { name: parsed.values.name });

  revalidatePath("/suppliers");
  redirect(`/suppliers/${data.id}`);
}

export async function updateSupplier(
  _prevState: SupplierFormState,
  formData: FormData,
): Promise<SupplierFormState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing supplier id." };

  const parsed = parseSupplierForm(formData);
  if ("error" in parsed) return { error: parsed.error ?? "Invalid input." };

  const isActive = formData.get("is_active") === "on";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase
    .from("suppliers")
    .update({ ...parsed.values, is_active: isActive })
    .eq("id", id);

  if (error) return { error: "Could not update the supplier. Please try again." };

  await auditLog(supabase, "update", "suppliers", id, {
    name: parsed.values.name,
    is_active: isActive,
  });

  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${id}`);
  return { error: null };
}

export async function deleteSupplier(
  supplierId: string,
): Promise<{ error: string | null }> {
  const id = String(supplierId ?? "");
  if (!id) return { error: "Missing supplier id." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase.from("suppliers").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      return { error: "This supplier has purchases and cannot be deleted. Deactivate it instead." };
    }
    return { error: "Could not delete the supplier. Please try again." };
  }

  await auditLog(supabase, "delete", "suppliers", id);

  revalidatePath("/suppliers");
  return { error: null };
}
