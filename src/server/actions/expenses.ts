"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { auditLog } from "@/server/audit";

export type ExpenseFormState = { error: string | null };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const METHODS = ["cash", "bank_transfer", "cheque", "credit"] as const;

export async function postExpense(
  _prevState: ExpenseFormState,
  formData: FormData,
): Promise<ExpenseFormState> {
  const categoryId = String(formData.get("category_id") ?? "");
  const expenseDate = String(formData.get("expense_date") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const payee = String(formData.get("payee") ?? "").trim() || null;
  const method = String(formData.get("method") ?? "") as (typeof METHODS)[number];
  const reference = String(formData.get("reference") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!categoryId) return { error: "Select a category." };
  if (!DATE_RE.test(expenseDate)) {
    return { error: "Expense date is required (YYYY-MM-DD)." };
  }
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Amount must be a number greater than 0." };
  }
  if (!METHODS.includes(method)) return { error: "Select a payment method." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data, error } = await supabase.rpc("post_expense", {
    p_category_id: categoryId,
    p_expense_date: expenseDate,
    p_amount: amount,
    p_payee: payee,
    p_method: method,
    p_reference: reference,
    p_notes: notes,
  });

  if (error) {
    if (error.code === "P0001") return { error: error.message };
    console.error("post_expense failed:", error);
    return { error: "Could not record the expense. Please try again." };
  }

  await auditLog(supabase, "create", "expenses", (data as { expense_id?: string } | null)?.expense_id ?? null, {
    amount,
    method,
  });

  revalidatePath("/expenses");
  redirect("/expenses");
}

export async function reverseExpense(
  _prevState: ExpenseFormState,
  formData: FormData,
): Promise<ExpenseFormState> {
  const expenseId = String(formData.get("expense_id") ?? "");
  if (!expenseId) return { error: "Missing expense id." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase.rpc("reverse_expense", {
    p_expense_id: expenseId,
  });

  if (error) {
    if (error.code === "P0001") return { error: error.message };
    console.error("reverse_expense failed:", error);
    return { error: "Could not reverse the expense. Please try again." };
  }

  revalidatePath("/expenses");
  return { error: null };
}

export async function addExpenseCategory(
  _prevState: ExpenseFormState,
  formData: FormData,
): Promise<ExpenseFormState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Enter a category name." };
  if (name.length > 80) return { error: "Category name is too long (max 80 characters)." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase
    .from("expense_categories")
    .insert({ owner_id: user.id, name });

  if (error) {
    if (error.code === "23505") return { error: "A category with this name already exists." };
    console.error("addExpenseCategory failed:", error);
    return { error: "Could not add the category. Please try again." };
  }

  await auditLog(supabase, "create", "expense_categories", null, { name });

  revalidatePath("/expenses");
  return { error: null };
}

export async function deleteExpenseCategory(
  categoryId: string,
): Promise<{ error: string | null }> {
  const id = String(categoryId ?? "");
  if (!id) return { error: "Missing category id." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { count } = await supabase
    .from("expenses")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id);

  if ((count ?? 0) > 0) {
    return { error: "This category has expenses and cannot be deleted." };
  }

  const { error } = await supabase.from("expense_categories").delete().eq("id", id);
  if (error) {
    return { error: "Could not delete the category. Please try again." };
  }

  await auditLog(supabase, "delete", "expense_categories", id);

  revalidatePath("/expenses");
  return { error: null };
}
