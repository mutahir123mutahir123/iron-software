import { createClient } from "@/lib/supabase/server";

export type OpenDoc = {
  id: string;
  number: string;
  date: string;
  total: number;
  allocated: number;
  outstanding: number;
  party_id: string | null;
};

export type PaymentRow = {
  id: string;
  payment_number: string;
  payment_date: string;
  amount: number;
  allocated: number;
  unallocated: number;
  method: string;
  status: string;
  party_type: string;
  customer_id: string | null;
  supplier_id: string | null;
};

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function fetchPostedAllocations(supabase: Supabase) {
  const { data } = await supabase
    .from("payment_allocations")
    .select("sale_id, purchase_id, amount, payments!inner(status)")
    .eq("payments.status", "posted");
  return (data ?? []) as unknown as {
    sale_id: string | null;
    purchase_id: string | null;
    amount: number;
  }[];
}

export async function getOpenSales(supabase: Supabase): Promise<OpenDoc[]> {
  const [salesResult, allocations] = await Promise.all([
    supabase
      .from("sales")
      .select("id, sale_number, sale_date, total, customer_id")
      .eq("status", "confirmed")
      .order("sale_date", { ascending: true })
      .order("sale_number", { ascending: true }),
    fetchPostedAllocations(supabase),
  ]);

  const allocatedBySale = new Map<string, number>();
  for (const row of allocations) {
    if (!row.sale_id) continue;
    allocatedBySale.set(row.sale_id, (allocatedBySale.get(row.sale_id) ?? 0) + Number(row.amount));
  }

  return (salesResult.data ?? []).map((s) => {
    const total = Number(s.total);
    const allocated = allocatedBySale.get(s.id as string) ?? 0;
    return {
      id: s.id as string,
      number: s.sale_number as string,
      date: s.sale_date as string,
      total,
      allocated,
      outstanding: Math.max(0, total - allocated),
      party_id: s.customer_id as string | null,
    };
  });
}

export async function getOpenPurchases(supabase: Supabase): Promise<OpenDoc[]> {
  const [purchasesResult, allocations] = await Promise.all([
    supabase
      .from("purchases")
      .select("id, purchase_number, purchase_date, total_cost, supplier_id")
      .eq("status", "confirmed")
      .order("purchase_date", { ascending: true })
      .order("purchase_number", { ascending: true }),
    fetchPostedAllocations(supabase),
  ]);

  const allocatedByPurchase = new Map<string, number>();
  for (const row of allocations) {
    if (!row.purchase_id) continue;
    allocatedByPurchase.set(
      row.purchase_id,
      (allocatedByPurchase.get(row.purchase_id) ?? 0) + Number(row.amount),
    );
  }

  return (purchasesResult.data ?? []).map((p) => {
    const total = Number(p.total_cost);
    const allocated = allocatedByPurchase.get(p.id as string) ?? 0;
    return {
      id: p.id as string,
      number: p.purchase_number as string,
      date: p.purchase_date as string,
      total,
      allocated,
      outstanding: Math.max(0, total - allocated),
      party_id: p.supplier_id as string | null,
    };
  });
}

export async function getPayments(
  supabase: Supabase,
  direction: "received" | "paid",
): Promise<PaymentRow[]> {
  const paymentsResult = await supabase
    .from("payments")
    .select(
      "id, payment_number, payment_date, amount, method, status, party_type, customer_id, supplier_id",
    )
    .eq("direction", direction)
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false });

  const payments = paymentsResult.data ?? [];
  if (payments.length === 0) return [];

  const { data: allocRows } = await supabase
    .from("payment_allocations")
    .select("payment_id, amount");

  const totalsByPayment = new Map<string, number>();
  for (const row of allocRows ?? []) {
    totalsByPayment.set(
      row.payment_id as string,
      (totalsByPayment.get(row.payment_id as string) ?? 0) + Number(row.amount),
    );
  }

  return payments.map((p) => {
    const amount = Number(p.amount);
    const allocated = totalsByPayment.get(p.id as string) ?? 0;
    return {
      id: p.id as string,
      payment_number: p.payment_number as string,
      payment_date: p.payment_date as string,
      amount,
      allocated,
      unallocated: Math.max(0, amount - allocated),
      method: p.method as string,
      status: p.status as string,
      party_type: p.party_type as string,
      customer_id: p.customer_id as string | null,
      supplier_id: p.supplier_id as string | null,
    };
  });
}
