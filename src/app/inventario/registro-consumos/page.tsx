"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function RegistroConsumosPage() {
  return (
    <section className="space-y-10 pb-16">
      <Card className="rounded-3xl border bg-background/95 shadow-sm">
        <CardHeader>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col">
                          <span className="font-semibold text-foreground">{record.article_code}</span>
                          <span className="text-xs text-muted-foreground">{record.article_name}</span>
                          {record.source_kit_code && (
                            <span className="text-xs text-muted-foreground">Derivado de kit {record.source_kit_code}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        <div className="flex flex-col">
                          <span>{record.reason || "-"}</span>
                          {record.area && <span className="text-xs text-muted-foreground">Área: {record.area}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{record.authorized_by || "-"}</td>
                      <td className="px-3 py-2 text-right font-semibold text-destructive">
                        -{numberFormatter.format(record.quantity_retail)} {record.retail_unit || "und"}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-destructive">
                        -{numberFormatter.format(record.quantity_storage)} {record.storage_unit || record.retail_unit || "und"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function unitLabel(unit: "STORAGE" | "RETAIL", storageUnit?: string | null, retailUnit?: string | null) {
  if (unit === "STORAGE") {
    return storageUnit ? `Unidad almacén: ${storageUnit}` : "Unidad almacén";
  }
  return retailUnit ? `Unidad detalle: ${retailUnit}` : "Unidad detalle";
}
