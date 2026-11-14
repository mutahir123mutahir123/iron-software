"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CuttingFormState = { error: string | null };
export type ReverseCuttingState = { error: string | null };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
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

export async function createCutting(
  _prevState: CuttingFormState,
  formData: FormData,
): Promise<CuttingFormState> {
  const sourcePieceId = String(formData.get("source_piece_id") ?? "");
  const cutDate = String(formData.get("cut_date") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const outputsRaw = String(formData.get("outputs") ?? "");
  const scrapRaw = String(formData.get("scrap_kg") ?? "").trim();

  if (!sourcePieceId) return { error: "Select the source piece." };
  if (!DATE_RE.test(cutDate)) {
    return { error: "Cut date is required (YYYY-MM-DD)." };
  }

  const scrapKg = scrapRaw === "" ? 0 : Number(scrapRaw);
  if (!Number.isFinite(scrapKg) || scrapKg < 0) {
    return { error: "Scrap weight must be a number ≥ 0." };
  }

  const { outputs, error: outputsError } = parseOutputs(outputsRaw);
  if (outputsError) return { error: outputsError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data, error } = await supabase.rpc("confirm_cutting", {
    p_source_piece_id: sourcePieceId,
    p_cut_date: cutDate,
    p_reference: reference,
    p_notes: notes,
    p_outputs: outputs,
    p_scrap_kg: scrapKg,
  });

  if (error) {
    if (error.code === "P0001") return { error: error.message };
    console.error("confirm_cutting failed:", error);
    return { error: "Could not record the cutting. Please try again." };
  }

  const cuttingRecordId = (data as { cutting_record_id?: string } | null)?.cutting_record_id;

  revalidatePath("/cutting");
  revalidatePath("/cutting/scrap");
  revalidatePath("/cutting/variance");
  revalidatePath("/inventory");
  revalidatePath("/inventory/reconciliation");

  if (cuttingRecordId) {
    redirect(`/cutting/${cuttingRecordId}`);
  }
  return { error: null };
}

export async function reverseCutting(
  _prevState: ReverseCuttingState,
  formData: FormData,
): Promise<ReverseCuttingState> {
  const cuttingRecordId = String(formData.get("cutting_record_id") ?? "");
  if (!cuttingRecordId) return { error: "Missing cutting record id." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase.rpc("reverse_cutting", {
    p_cutting_record_id: cuttingRecordId,
  });

  if (error) {
    if (error.code === "P0001") return { error: error.message };
    console.error("reverse_cutting failed:", error);
    return { error: "Could not reverse the cutting. Please try again." };
  }

  revalidatePath("/cutting");
  revalidatePath("/cutting/scrap");
  revalidatePath("/cutting/variance");
  revalidatePath(`/cutting/${cuttingRecordId}`);
  revalidatePath("/inventory");
  revalidatePath("/inventory/reconciliation");
  return { error: null };
}
