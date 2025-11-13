import { redirect } from "next/navigation";

export default function FacturasPage() {
  redirect("/facturacion?view=historial");
}
