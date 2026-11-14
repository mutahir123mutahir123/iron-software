"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { auditLog } from "@/server/audit";

export type PaymentFormState = { error: string | null };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const METHODS = ["cash", "bank_transfer", "cheque"] as const;
const DIRECTIONS = ["received", "paid"] as const;

type AllocationInput = { sale_id?: string; purchase_id?: string; amount: number };

function parseAllocations(raw: string): { allocations?: AllocationInput[]; error?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "Allocations could not be read. Please re-enter them." };
  }

  if (!Array.isArray(parsed)) {
    return { error: "Allocations must be a list." };
  }
  if (parsed.length > 100) {
    return { error: "A payment cannot be allocated to more than 100 documents." };
  }

  const allocations: AllocationInput[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) {
      return { error: "Each allocation needs a document and an amount." };
    }
    const e = entry as Record<string, unknown>;
    const amount = Number(e.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { error: "Each allocation amount must be a number greater than 0." };
    }
    const saleId = e.sale_id ? String(e.sale_id) : undefined;
    const purchaseId = e.purchase_id ? String(e.purchase_id) : undefined;
    if ((saleId ? 1 : 0) + (purchaseId ? 1 : 0) !== 1) {
      return { error: "Each allocation must reference exactly one document." };
    }
    allocations.push({ sale_id: saleId, purchase_id: purchaseId, amount });
  }

  return { allocations };
}

function validatePartyAndDocuments(
  direction: string,
  allocations: AllocationInput[],
): string | null {
  for (const alloc of allocations) {
    if (direction === "received" && alloc.purchase_id) {
      return "A received payment can only be allocated to sales invoices.";
    }
    if (direction === "paid" && alloc.sale_id) {
      return "A paid payment can only be allocated to purchase bills.";
    }
  }
  return null;
}

export async function createPayment(
  _prevState: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const direction = String(formData.get("direction") ?? "") as (typeof DIRECTIONS)[number];
  const partyId = String(formData.get("party_id") ?? "");
  const paymentDate = String(formData.get("payment_date") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const method = String(formData.get("method") ?? "") as (typeof METHODS)[number];
  const reference = String(formData.get("reference") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const allocationsRaw = String(formData.get("allocations") ?? "[]");

  if (!DIRECTIONS.includes(direction)) return { error: "Select received or paid." };
  if (!partyId) {
    return {
      error: direction === "received" ? "Select a customer." : "Select a supplier.",
    };
  }
  if (!DATE_RE.test(paymentDate)) {
    return { error: "Payment date is required (YYYY-MM-DD)." };
  }
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Amount must be a number greater than 0." };
  }
  if (!METHODS.includes(method)) return { error: "Select a payment method." };

  const { allocations, error: allocError } = parseAllocations(allocationsRaw);
  if (allocError) return { error: allocError };
  const partyError = validatePartyAndDocuments(direction, allocations!);
  if (partyError) return { error: partyError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data, error } = await supabase.rpc("record_payment", {
    p_direction: direction,
    p_party_type: direction === "received" ? "customer" : "supplier",
    p_customer_id: direction === "received" ? partyId : null,
    p_supplier_id: direction === "paid" ? partyId : null,
    p_payment_date: paymentDate,
    p_amount: amount,
    p_method: method,
    p_reference: reference,
    p_notes: notes,
    p_allocations: allocations,
  });

  if (error) {
    if (error.code === "P0001") return { error: error.message };
    console.error("record_payment failed:", error);
    return { error: "Could not record the payment. Please try again." };
  }

  const paymentId = (data as { payment_id?: string } | null)?.payment_id;

  await auditLog(supabase, "create", "payments", paymentId ?? null, {
    direction,
    amount,
    method,
    allocated: (data as { allocated?: number } | null)?.allocated,
  });

  revalidatePath("/payments");
  revalidatePath("/customers");
  revalidatePath("/suppliers");
  revalidatePath("/sales");
  revalidatePath("/purchases");

  redirect(paymentId ? `/payments/${paymentId}` : "/payments");
}

export async function allocatePayment(
  _prevState: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const paymentId = String(formData.get("payment_id") ?? "");
  const allocationsRaw = String(formData.get("allocations") ?? "[]");
  if (!paymentId) return { error: "Missing payment id." };

  const { allocations, error: allocError } = parseAllocations(allocationsRaw);
  if (allocError) return { error: allocError };
  if (allocations!.length === 0) return { error: "Add at least one allocation." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data: payment } = await supabase
    .from("payments")
    .select("direction")
    .eq("id", paymentId)
    .maybeSingle();

  const partyError = validatePartyAndDocuments(
    (payment?.direction as string) ?? "",
    allocations!,
  );
  if (partyError) return { error: partyError };

  const { error } = await supabase.rpc("allocate_payment", {
    p_payment_id: paymentId,
    p_allocations: allocations,
  });

  if (error) {
    if (error.code === "P0001") return { error: error.message };
    console.error("allocate_payment failed:", error);
    return { error: "Could not allocate the payment. Please try again." };
  }

  await auditLog(supabase, "allocate", "payments", paymentId, {});

  revalidatePath("/payments");
  revalidatePath(`/payments/${paymentId}`);
  revalidatePath("/sales");
  revalidatePath("/purchases");
  return { error: null };
}

export async function reversePayment(
  _prevState: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const paymentId = String(formData.get("payment_id") ?? "");
  if (!paymentId) return { error: "Missing payment id." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase.rpc("reverse_payment", {
    p_payment_id: paymentId,
  });

  if (error) {
    if (error.code === "P0001") return { error: error.message };
    console.error("reverse_payment failed:", error);
    return { error: "Could not reverse the payment. Please try again." };
  }

  revalidatePath("/payments");
  revalidatePath(`/payments/${paymentId}`);
  revalidatePath("/sales");
  revalidatePath("/purchases");
  revalidatePath("/customers");
  revalidatePath("/suppliers");
  return { error: null };
}
