import { Prisma } from "@prisma/client";
import type { Decimal } from "@prisma/client/runtime/library";

import { IArticleKitRepository, KitComponentInput, KitComponentRow } from "./IArticleKitRepository";
import { prisma } from "@/lib/db/prisma";

export class ArticleKitRepository implements IArticleKitRepository {
  async getKitComponents(kit_article_code: string): Promise<KitComponentRow[]> {
    const kitArticle = await prisma.articles.findUnique({
      where: { article_code: kit_article_code },
      select: { id: true },
    });

    if (!kitArticle) {
      return [];
    }

    const result = await prisma.article_kits.findMany({
      where: { kit_article_id: kitArticle.id },
      include: {
        articles_article_kits_component_article_idToarticles: {
          select: {
            id: true,
            article_code: true,
            name: true,
          },
        },
      },
      orderBy: {
        articles_article_kits_component_article_idToarticles: {
          name: "asc",
        },
      },
    });

    return result.map((row: { component_article_id: number | bigint; component_qty_retail: Decimal; articles_article_kits_component_article_idToarticles: { article_code: string; name: string } }) => ({
      component_article_id: Number(row.component_article_id),
      component_article_code: row.articles_article_kits_component_article_idToarticles.article_code,
      component_article_name: row.articles_article_kits_component_article_idToarticles.name,
      component_qty_retail: Number(row.component_qty_retail),
    }));
  }

  async upsertKitComponents(kit_article_code: string, components: KitComponentInput[]): Promise<{ count: number }> {
    const kitArticle = await prisma.articles.findUnique({
      where: { article_code: kit_article_code },
      select: { id: true },
    });

    if (!kitArticle) {
      throw new Error("Kit no encontrado");
    }

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.article_kits.deleteMany({
        where: { kit_article_id: kitArticle.id },
      });

      for (const component of components) {
        const componentArticle = await tx.articles.findUnique({
          where: { article_code: component.component_article_code },
          select: { id: true },
        });

        if (!componentArticle) {
          throw new Error(`Componente no encontrado: ${component.component_article_code}`);
        }

        await tx.article_kits.create({
          data: {
            kit_article_id: kitArticle.id,
            component_article_id: componentArticle.id,
            component_qty_retail: component.component_qty_retail,
          },
        });
      }
    });

    return { count: components.length };
  }
}
