"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { auditLog } from "@/server/audit";
import { parseNonNegativeNumber, parsePositiveNumber } from "@/server/parse";

export type SaleFormState = { error: string | null };
export type SaleLineFormState = { error: string | null };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SALE_TYPES = ["full", "cut", "scrap"] as const;
type SaleType = (typeof SALE_TYPES)[number];

const MAX_OUTPUTS = 50;

type OutputInput = { length_ft: number; weight_kg: number };

function parseOutputs(raw: string): { outputs?: OutputInput[]; error?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "Outputs could not be read. Please re-enter them." };
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { error: "Add at least one output piece." };
  }
  if (parsed.length > MAX_OUTPUTS) {
    return { error: `A cut cannot have more than ${MAX_OUTPUTS} output pieces.` };
  }

  const outputs: OutputInput[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) {
      return { error: "Each output needs a length and a weight." };
    }
    const { length_ft: lengthRaw, weight_kg: weightRaw } = entry as Record<string, unknown>;
    const length = Number(lengthRaw);
    const weight = Number(weightRaw);
    if (!Number.isFinite(length) || length <= 0) {
      return { error: "Each output needs a length greater than 0 ft." };
    }
    if (!Number.isFinite(weight) || weight <= 0) {
      return { error: "Each output needs a weight greater than 0 kg." };
    }
    outputs.push({ length_ft: length, weight_kg: weight });
  }

  return { outputs };
}

export async function createSaleDraft(
  _prevState: SaleFormState,
  formData: FormData,
): Promise<SaleFormState> {
  const saleType = String(formData.get("sale_type") ?? "") as SaleType;
  const customerId = String(formData.get("customer_id") ?? "");
  const saleDate = String(formData.get("sale_date") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!SALE_TYPES.includes(saleType)) return { error: "Select a sale type." };
  if (!customerId) return { error: "Customer is required." };
  if (!DATE_RE.test(saleDate)) {
    return { error: "Sale date is required (YYYY-MM-DD)." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data: numberData, error: numberError } = await supabase.rpc(
    "next_document_number",
    { p_document_type: "sale" },
  );
  if (numberError || !numberData) {
    return { error: "Could not allocate a sale number. Please try again." };
  }

  const { data, error } = await supabase
    .from("sales")
    .insert({
      owner_id: user.id,
      sale_number: numberData as string,
      sale_type: saleType,
      customer_id: customerId,
      sale_date: saleDate,
      notes,
      status: "draft",
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23503") return { error: "Selected customer does not exist." };
    return { error: "Could not create the sale. Please try again." };
  }

  await auditLog(supabase, "create", "sales", data.id, {
    sale_number: numberData,
    sale_type: saleType,
  });

  revalidatePath("/sales");
  redirect(`/sales/${data.id}`);
}

async function getDraftSale(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
) {
  const { data } = await supabase
    .from("sales")
    .select("id, status, sale_type")
    .eq("id", id)
    .maybeSingle();
  return data;
}

export async function updateSaleDraft(
  _prevState: SaleFormState,
  formData: FormData,
): Promise<SaleFormState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing sale id." };

  const customerId = String(formData.get("customer_id") ?? "");
  const saleDate = String(formData.get("sale_date") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!customerId) return { error: "Customer is required." };
  if (!DATE_RE.test(saleDate)) {
    return { error: "Sale date is required (YYYY-MM-DD)." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const draft = await getDraftSale(supabase, id);
  if (!draft) return { error: "Sale not found." };
  if (draft.status !== "draft") {
    return { error: "Only a draft sale can be edited." };
  }

  const { error } = await supabase
    .from("sales")
    .update({ customer_id: customerId, sale_date: saleDate, notes })
    .eq("id", id);

  if (error) {
    if (error.code === "23503") return { error: "Selected customer does not exist." };
    return { error: "Could not update the sale. Please try again." };
  }

  await auditLog(supabase, "update", "sales", id, { customer_id: customerId });

  revalidatePath("/sales");
  revalidatePath(`/sales/${id}`);
  return { error: null };
}

export async function deleteSaleDraft(saleId: string): Promise<void> {
  const id = String(saleId ?? "");
  if (!id) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from("sales")
    .delete()
    .eq("id", id)
    .eq("status", "draft");

  if (!error) {
    await auditLog(supabase, "delete", "sales", id);
  }

  revalidatePath("/sales");
}

export async function addSaleLine(
  _prevState: SaleLineFormState,
  formData: FormData,
): Promise<SaleLineFormState> {
  const saleId = String(formData.get("sale_id") ?? "");
  const pieceId = String(formData.get("inventory_piece_id") ?? "");
  const lotId = String(formData.get("scrap_lot_id") ?? "");
  const rate = parseNonNegativeNumber(formData.get("rate"));
  const weightRaw = String(formData.get("weight_kg") ?? "").trim();
  const weightInput = weightRaw === "" ? null : parsePositiveNumber(formData.get("weight_kg"));

  if (!saleId) return { error: "Missing sale id." };
  if (rate === null) return { error: "Rate must be a number ≥ 0." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const draft = await getDraftSale(supabase, saleId);
  if (!draft) return { error: "Sale not found." };
  if (draft.status !== "draft") {
    return { error: "Only a draft sale can be edited." };
  }

  if (draft.sale_type === "scrap") {
    if (!lotId) return { error: "Select a scrap lot." };
    if (weightInput === null) {
      return { error: "Weight must be a number greater than 0." };
    }

    const { data: lot } = await supabase
      .from("scrap_lots")
      .select("id, status, remaining_weight_kg, product_id")
      .eq("id", lotId)
      .maybeSingle();
    if (!lot) return { error: "Selected scrap lot does not exist." };
    if (lot.status !== "available") {
      return { error: "Selected scrap lot is not available." };
    }
    if (weightInput > Number(lot.remaining_weight_kg)) {
      return { error: "Weight exceeds the lot's remaining weight." };
    }

    const { error } = await supabase.from("sale_items").insert({
      owner_id: user.id,
      sale_id: saleId,
      sale_type: "scrap",
      scrap_lot_id: lotId,
      product_id: (lot as { product_id: string | null }).product_id,
      rate,
      weight_kg: weightInput,
      amount: Math.round(weightInput * rate * 100) / 100,
    });

    if (error) return { error: "Could not add the line. Please try again." };
  } else {
    if (!pieceId) return { error: "Select a piece." };

    const { data: piece } = await supabase
      .from("inventory_pieces")
      .select("id, status, measured_weight_kg, product_id")
      .eq("id", pieceId)
      .maybeSingle();
    if (!piece) return { error: "Selected piece does not exist." };
    if (piece.status !== draft.sale_type) {
      return {
        error: draft.sale_type === "full"
          ? "Selected piece is not a full shaft."
          : "Selected piece is not a cut piece.",
      };
    }

    const weight = Number(piece.measured_weight_kg);
    const { error } = await supabase.from("sale_items").insert({
      owner_id: user.id,
      sale_id: saleId,
      sale_type: draft.sale_type,
      inventory_piece_id: pieceId,
      product_id: (piece as { product_id: string }).product_id,
      rate,
      weight_kg: weight,
      amount: Math.round(weight * rate * 100) / 100,
    });

    if (error) return { error: "Could not add the line. Please try again." };
  }

  revalidatePath(`/sales/${saleId}`);
  return { error: null };
}

export async function removeSaleLine(lineId: string): Promise<void> {
  const id = String(lineId ?? "");
  if (!id) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: line } = await supabase
    .from("sale_items")
    .select("sale_id")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("sale_items").delete().eq("id", id);

  if (!error && line) {
    revalidatePath(`/sales/${line.sale_id}`);
  }
}

export async function confirmSale(
  _prevState: SaleFormState,
  formData: FormData,
): Promise<SaleFormState> {
  const saleId = String(formData.get("sale_id") ?? "");
  if (!saleId) return { error: "Missing sale id." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase.rpc("confirm_sale", {
    p_sale_id: saleId,
  });

  if (error) {
    if (error.code === "P0001") return { error: error.message };
    console.error("confirm_sale failed:", error);
    return { error: "Could not confirm the sale. Please try again." };
  }

  revalidatePath("/sales");
  revalidatePath(`/sales/${saleId}`);
  revalidatePath("/inventory");
  revalidatePath("/inventory/reconciliation");
  revalidatePath("/cutting/scrap");
  return { error: null };
}

export async function reverseSale(
  _prevState: SaleFormState,
  formData: FormData,
): Promise<SaleFormState> {
  const saleId = String(formData.get("sale_id") ?? "");
  if (!saleId) return { error: "Missing sale id." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase.rpc("reverse_sale", {
    p_sale_id: saleId,
  });

  if (error) {
    if (error.code === "P0001") return { error: error.message };
    console.error("reverse_sale failed:", error);
    return { error: "Could not reverse the sale. Please try again." };
  }

  revalidatePath("/sales");
  revalidatePath(`/sales/${saleId}`);
  revalidatePath("/inventory");
  revalidatePath("/inventory/reconciliation");
  revalidatePath("/cutting/scrap");
  return { error: null };
}

export async function createCutAndSellSale(
  _prevState: SaleFormState,
  formData: FormData,
): Promise<SaleFormState> {
  const sourcePieceId = String(formData.get("source_piece_id") ?? "");
  const customerId = String(formData.get("customer_id") ?? "");
  const saleDate = String(formData.get("sale_date") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const outputsRaw = String(formData.get("outputs") ?? "");
  const scrapRaw = String(formData.get("scrap_kg") ?? "").trim();
  const soldIndexRaw = String(formData.get("sold_output_index") ?? "").trim();
  const rate = parseNonNegativeNumber(formData.get("rate"));

  if (!sourcePieceId) return { error: "Select the source piece." };
  if (!customerId) return { error: "Customer is required." };
  if (!DATE_RE.test(saleDate)) {
    return { error: "Sale date is required (YYYY-MM-DD)." };
  }
  if (rate === null) return { error: "Rate must be a number ≥ 0." };

  const scrapKg = scrapRaw === "" ? 0 : Number(scrapRaw);
  if (!Number.isFinite(scrapKg) || scrapKg < 0) {
    return { error: "Scrap weight must be a number ≥ 0." };
  }

  const soldIndex = Number(soldIndexRaw);
  if (!Number.isInteger(soldIndex) || soldIndex < 0) {
    return { error: "Select which output to sell." };
  }

  const { outputs, error: outputsError } = parseOutputs(outputsRaw);
  if (outputsError) return { error: outputsError };
  if (soldIndex >= outputs!.length) {
    return { error: "Selected output index is out of range." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data, error } = await supabase.rpc("confirm_cut_sale", {
    p_source_piece_id: sourcePieceId,
    p_outputs: outputs,
    p_scrap_kg: scrapKg,
    p_sold_output_index: soldIndex,
    p_customer_id: customerId,
    p_sale_date: saleDate,
    p_rate: rate,
    p_reference: reference,
    p_notes: notes,
  });

  if (error) {
    if (error.code === "P0001") return { error: error.message };
    console.error("confirm_cut_sale failed:", error);
    return { error: "Could not complete the cut and sale. Please try again." };
  }

  const saleId = (data as { sale_id?: string } | null)?.sale_id;

  revalidatePath("/sales");
  revalidatePath("/cutting");
  revalidatePath("/cutting/scrap");
  revalidatePath("/inventory");
  revalidatePath("/inventory/reconciliation");

  if (saleId) {
    redirect(`/sales/${saleId}`);
  }
  return { error: null };
}
