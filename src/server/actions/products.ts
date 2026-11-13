"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { auditLog } from "@/server/audit";

export type ProductFormState = { error: string | null };

function parsePositiveNumber(value: FormDataEntryValue | null): number | null {
  if (value === null) return null;
  const n = Number(String(value).trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function parseNonNegativeNumber(value: FormDataEntryValue | null): number | null {
  if (value === null) return null;
  const n = Number(String(value).trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function parseProductForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const grade = String(formData.get("grade") ?? "").trim();
  const categoryId = String(formData.get("category_id") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const diameter = parsePositiveNumber(formData.get("diameter_mm"));
  const wallThicknessRaw = String(formData.get("wall_thickness_mm") ?? "").trim();
  const wallThickness =
    wallThicknessRaw === "" ? null : parsePositiveNumber(formData.get("wall_thickness_mm"));
  const standardLength = parsePositiveNumber(formData.get("standard_length_ft"));
  const weightPerFt = parsePositiveNumber(formData.get("theoretical_weight_per_ft"));

  if (!name) return { error: "Product name is required." } as const;
  if (!grade) return { error: "Grade / material is required." } as const;
  if (diameter === null) return { error: "Diameter must be a number greater than 0." } as const;
  if (wallThicknessRaw !== "" && wallThickness === null)
    return { error: "Wall thickness must be a number greater than 0." } as const;
  if (standardLength === null)
    return { error: "Standard length must be a number greater than 0." } as const;
  if (weightPerFt === null)
    return { error: "Theoretical weight per ft must be a number greater than 0." } as const;

  return {
    values: {
      name,
      grade,
      category_id: categoryId,
      notes,
      diameter_mm: diameter,
      wall_thickness_mm: wallThickness,
      standard_length_ft: standardLength,
      theoretical_weight_per_ft: weightPerFt,
    },
  } as const;
}

export async function createProduct(
  _prevState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const parsed = parseProductForm(formData);
  if ("error" in parsed) return { error: parsed.error ?? "Invalid input." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data, error } = await supabase
    .from("products")
    .insert({ owner_id: user.id, ...parsed.values })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "A product with the same diameter, wall thickness, grade and standard length already exists." };
    }
    return { error: "Could not create the product. Please try again." };
  }

  await auditLog(supabase, "create", "products", data.id, { name: parsed.values.name });

  revalidatePath("/products");
  redirect(`/products/${data.id}`);
}

export async function updateProduct(
  _prevState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing product id." };

  const parsed = parseProductForm(formData);
  if ("error" in parsed) return { error: parsed.error ?? "Invalid input." };

  const isActive = formData.get("is_active") === "on";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase
    .from("products")
    .update({ ...parsed.values, is_active: isActive })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { error: "A product with the same diameter, wall thickness, grade and standard length already exists." };
    }
    return { error: "Could not update the product. Please try again." };
  }

  await auditLog(supabase, "update", "products", id, {
    name: parsed.values.name,
    is_active: isActive,
  });

  revalidatePath("/products");
  revalidatePath(`/products/${id}`);
  return { error: null };
}

export type PricingFormState = { error: string | null };

export async function createPricing(
  _prevState: PricingFormState,
  formData: FormData,
): Promise<PricingFormState> {
  const productId = String(formData.get("product_id") ?? "");
  const effectiveFrom = String(formData.get("effective_from") ?? "");
  const effectiveToRaw = String(formData.get("effective_to") ?? "").trim();
  const effectiveTo = effectiveToRaw === "" ? null : effectiveToRaw;
  const fullRate = parseNonNegativeNumber(formData.get("full_rate"));
  const cutRate = parseNonNegativeNumber(formData.get("cut_rate"));

  if (!productId) return { error: "Missing product id." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
    return { error: "Effective-from date is required (YYYY-MM-DD)." };
  }
  if (effectiveTo !== null && !/^\d{4}-\d{2}-\d{2}$/.test(effectiveTo)) {
    return { error: "Effective-to date must be YYYY-MM-DD." };
  }
  if (effectiveTo !== null && effectiveTo < effectiveFrom) {
    return { error: "Effective-to cannot be before effective-from." };
  }
  if (fullRate === null) return { error: "Full-length rate must be a number ≥ 0." };
  if (cutRate === null) return { error: "Cut-piece rate must be a number ≥ 0." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data, error } = await supabase
    .from("product_pricing")
    .insert({
      owner_id: user.id,
      product_id: productId,
      effective_from: effectiveFrom,
      effective_to: effectiveTo,
      full_rate: fullRate,
      cut_rate: cutRate,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23P01") {
      return { error: "These dates overlap an existing price range for this product. Adjust the dates." };
    }
    if (error.code === "23505") {
      return { error: "A price row already starts on that date for this product." };
    }
    return { error: "Could not save the price. Please try again." };
  }

  await auditLog(supabase, "create", "product_pricing", data.id, {
    product_id: productId,
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
    full_rate: fullRate,
    cut_rate: cutRate,
  });

  revalidatePath(`/products/${productId}`);
  revalidatePath("/products");
  return { error: null };
}

export async function deletePricing(pricingId: string): Promise<void> {
  const id = String(pricingId ?? "");
  if (!id) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: row } = await supabase
    .from("product_pricing")
    .select("id, product_id")
    .eq("id", id)
    .maybeSingle();
  if (!row) return;

  const { error } = await supabase.from("product_pricing").delete().eq("id", id);
  if (!error) {
    await auditLog(supabase, "delete", "product_pricing", id, { product_id: row.product_id });
  }

  revalidatePath(`/products/${row.product_id}`);
  revalidatePath("/products");
}
