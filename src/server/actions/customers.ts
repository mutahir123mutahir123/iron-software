"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { auditLog } from "@/server/audit";

export type CustomerFormState = { error: string | null };

function parseCustomerForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const address = String(formData.get("address") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!name) return { error: "Customer name is required." } as const;

  return { values: { name, phone, address, notes } } as const;
}

export async function createCustomer(
  _prevState: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const parsed = parseCustomerForm(formData);
  if ("error" in parsed) return { error: parsed.error ?? "Invalid input." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data, error } = await supabase
    .from("customers")
    .insert({ owner_id: user.id, ...parsed.values })
    .select("id")
    .single();

  if (error) return { error: "Could not create the customer. Please try again." };

  await auditLog(supabase, "create", "customers", data.id, { name: parsed.values.name });

  revalidatePath("/customers");
  redirect(`/customers/${data.id}`);
}

export async function updateCustomer(
  _prevState: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing customer id." };

  const parsed = parseCustomerForm(formData);
  if ("error" in parsed) return { error: parsed.error ?? "Invalid input." };

  const isActive = formData.get("is_active") === "on";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase
    .from("customers")
    .update({ ...parsed.values, is_active: isActive })
    .eq("id", id);

  if (error) return { error: "Could not update the customer. Please try again." };

  await auditLog(supabase, "update", "customers", id, {
    name: parsed.values.name,
    is_active: isActive,
  });

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  return { error: null };
}

export async function deleteCustomer(
  customerId: string,
): Promise<{ error: string | null }> {
  const id = String(customerId ?? "");
  if (!id) return { error: "Missing customer id." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      return { error: "This customer has sales and cannot be deleted. Deactivate it instead." };
    }
    return { error: "Could not delete the customer. Please try again." };
  }

  await auditLog(supabase, "delete", "customers", id);

  revalidatePath("/customers");
  return { error: null };
}
