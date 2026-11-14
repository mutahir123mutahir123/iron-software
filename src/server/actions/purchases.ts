"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { auditLog } from "@/server/audit";
import { parseNonNegativeNumber, parsePositiveNumber } from "@/server/parse";

export type PurchaseFormState = { error: string | null };
export type PurchaseItemFormState = { error: string | null };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseHeaderForm(formData: FormData) {
  const supplierId = String(formData.get("supplier_id") ?? "");
  const purchaseDate = String(formData.get("purchase_date") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const additionalCostsRaw = String(formData.get("additional_costs") ?? "").trim();
  const additionalCosts =
    additionalCostsRaw === "" ? 0 : parseNonNegativeNumber(formData.get("additional_costs"));

  if (!supplierId) return { error: "Supplier is required." } as const;
  if (!DATE_RE.test(purchaseDate)) {
    return { error: "Purchase date is required (YYYY-MM-DD)." } as const;
  }
  if (additionalCosts === null) {
    return { error: "Additional costs must be a number ≥ 0." } as const;
  }

  return {
    values: {
      supplier_id: supplierId,
      purchase_date: purchaseDate,
      reference,
      notes,
      additional_costs: additionalCosts,
    },
  } as const;
}

export async function createPurchaseDraft(
  _prevState: PurchaseFormState,
  formData: FormData,
): Promise<PurchaseFormState> {
  const parsed = parseHeaderForm(formData);
  if ("error" in parsed) return { error: parsed.error ?? "Invalid input." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data: numberData, error: numberError } = await supabase.rpc(
    "next_document_number",
    { p_document_type: "purchase" },
  );
  if (numberError || !numberData) {
    return { error: "Could not allocate a purchase number. Please try again." };
  }

  const { data, error } = await supabase
    .from("purchases")
    .insert({
      owner_id: user.id,
      purchase_number: numberData as string,
      status: "draft",
      ...parsed.values,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23503") return { error: "Selected supplier does not exist." };
    return { error: "Could not create the purchase. Please try again." };
  }

  await auditLog(supabase, "create", "purchases", data.id, {
    purchase_number: numberData,
  });

  revalidatePath("/purchases");
  redirect(`/purchases/${data.id}`);
}

async function getDraftPurchase(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
) {
  const { data } = await supabase
    .from("purchases")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  return data;
}

export async function updatePurchaseDraft(
  _prevState: PurchaseFormState,
  formData: FormData,
): Promise<PurchaseFormState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing purchase id." };

  const parsed = parseHeaderForm(formData);
  if ("error" in parsed) return { error: parsed.error ?? "Invalid input." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const draft = await getDraftPurchase(supabase, id);
  if (!draft) return { error: "Purchase not found." };
  if (draft.status !== "draft") {
    return { error: "Only a draft purchase can be edited." };
  }

  const { error } = await supabase.from("purchases").update(parsed.values).eq("id", id);

  if (error) {
    if (error.code === "23503") return { error: "Selected supplier does not exist." };
    return { error: "Could not update the purchase. Please try again." };
  }

  await auditLog(supabase, "update", "purchases", id, parsed.values);

  revalidatePath("/purchases");
  revalidatePath(`/purchases/${id}`);
  return { error: null };
}

export async function deletePurchaseDraft(purchaseId: string): Promise<void> {
  const id = String(purchaseId ?? "");
  if (!id) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from("purchases")
    .delete()
    .eq("id", id)
    .eq("status", "draft");

  if (!error) {
    await auditLog(supabase, "delete", "purchases", id);
  }

  revalidatePath("/purchases");
}

export async function addPurchaseItem(
  _prevState: PurchaseItemFormState,
  formData: FormData,
): Promise<PurchaseItemFormState> {
  const purchaseId = String(formData.get("purchase_id") ?? "");
  const productId = String(formData.get("product_id") ?? "");
  const lengthFt = parsePositiveNumber(formData.get("measured_length_ft"));
  const weightKg = parsePositiveNumber(formData.get("measured_weight_kg"));
  const purchaseCost = parseNonNegativeNumber(formData.get("purchase_cost"));

  if (!purchaseId) return { error: "Missing purchase id." };
  if (!productId) return { error: "Product is required." };
  if (lengthFt === null) return { error: "Length must be a number greater than 0." };
  if (weightKg === null) return { error: "Weight must be a number greater than 0." };
  if (purchaseCost === null) return { error: "Purchase cost must be a number ≥ 0." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const draft = await getDraftPurchase(supabase, purchaseId);
  if (!draft) return { error: "Purchase not found." };
  if (draft.status !== "draft") {
    return { error: "Only a draft purchase can be edited." };
  }

  const { data: product } = await supabase
    .from("products")
    .select("id, is_active")
    .eq("id", productId)
    .maybeSingle();
  if (!product) return { error: "Selected product does not exist." };
  if (!product.is_active) return { error: "Selected product is inactive." };

  const { error } = await supabase.from("purchase_items").insert({
    owner_id: user.id,
    purchase_id: purchaseId,
    product_id: productId,
    measured_length_ft: lengthFt,
    measured_weight_kg: weightKg,
    purchase_cost: purchaseCost,
  });

  if (error) return { error: "Could not add the item. Please try again." };

  revalidatePath(`/purchases/${purchaseId}`);
  return { error: null };
}

export async function removePurchaseItem(itemId: string): Promise<void> {
  const id = String(itemId ?? "");
  if (!id) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: item } = await supabase
    .from("purchase_items")
    .select("purchase_id")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("purchase_items").delete().eq("id", id);

  if (!error && item) {
    revalidatePath(`/purchases/${item.purchase_id}`);
  }
}

export async function confirmPurchase(
  _prevState: PurchaseFormState,
  formData: FormData,
): Promise<PurchaseFormState> {
  const purchaseId = String(formData.get("purchase_id") ?? "");
  if (!purchaseId) return { error: "Missing purchase id." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase.rpc("confirm_purchase", {
    p_purchase_id: purchaseId,
  });

  if (error) {
    if (error.code === "P0001") return { error: error.message };
    console.error("confirm_purchase failed:", error);
    return { error: "Could not confirm the purchase. Please try again." };
  }

  revalidatePath("/purchases");
  revalidatePath(`/purchases/${purchaseId}`);
  revalidatePath("/inventory");
  revalidatePath("/inventory/reconciliation");
  return { error: null };
}
