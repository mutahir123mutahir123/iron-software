"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { auditLog } from "@/server/audit";

export type CategoryFormState = { error: string | null };

export async function createCategory(
  _prevState: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Category name is required." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data, error } = await supabase
    .from("product_categories")
    .insert({ owner_id: user.id, name })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { error: "That category already exists." };
    return { error: "Could not create the category. Please try again." };
  }

  await auditLog(supabase, "create", "product_categories", data.id, { name });

  revalidatePath("/products/categories");
  revalidatePath("/products");
  return { error: null };
}

export async function deleteCategory(categoryId: string): Promise<{ error: string | null }> {
  const id = String(categoryId ?? "");
  if (!id) return { error: "Missing category id." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { count, error: countError } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id);

  if (countError) return { error: "Could not check products using this category." };
  if ((count ?? 0) > 0) {
    return { error: "Category is in use by one or more products. Reassign those products first." };
  }

  const { error } = await supabase.from("product_categories").delete().eq("id", id);
  if (error) return { error: "Could not delete the category. Please try again." };

  await auditLog(supabase, "delete", "product_categories", id);

  revalidatePath("/products/categories");
  revalidatePath("/products");
  return { error: null };
}
