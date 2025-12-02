import type { CustomerSummaryDTO } from "@/lib/types/cxc";

const CONTADO_CODE = "CONTADO";

/**
 * Verifica si un cliente es elegible para asignarse como cliente predeterminado de caja.
 * Requiere que la condición de pago del cliente sea exactamente CONTADO.
 */
export function isDefaultCustomerEligible(summary: Pick<CustomerSummaryDTO, "paymentTermCode"> | null | undefined): boolean {
  if (!summary || typeof summary.paymentTermCode !== "string") {
    return false;
  }
  return summary.paymentTermCode.trim().toUpperCase() === CONTADO_CODE;
}

/**
 * Devuelve el listado de clientes elegibles para asignarse como predeterminados de caja.
 */
export function filterEligibleDefaultCustomers<T extends Pick<CustomerSummaryDTO, "paymentTermCode">>(customers: T[]): T[] {
  return customers.filter((customer) => isDefaultCustomerEligible(customer));
}
