import { env } from "@/lib/env";
import {
  ArticleClassificationFilters,
  ArticleClassificationRow,
  IArticleClassificationRepository,
  UpdateArticleClassificationInput,
} from "@/lib/repositories/IArticleClassificationRepository";
import { ArticleClassificationRepository } from "@/lib/repositories/ArticleClassificationRepository";

const MAX_LEVEL = 6;
const MAX_FULL_CODE_LENGTH = 24;

type CreateClassificationParams = {
  code: string;
  name: string;
  parentFullCode?: string | null;
  isActive?: boolean;
};

type UpdateClassificationParams = {
  name?: string;
  isActive?: boolean;
};

type MutableClassificationRow = ArticleClassificationRow & { readonly?: never };

const mockStore = new Map<number, MutableClassificationRow>();
let mockSequence = 0;

const mockSeed: Array<Omit<ArticleClassificationRow, "createdAt" | "updatedAt"> & { createdAt?: string; updatedAt?: string | null }> = [
  { id: 1, level: 1, code: "01", fullCode: "01", name: "Bebidas", parentFullCode: null, isActive: true },
  { id: 2, level: 2, code: "0101", fullCode: "0101", name: "Cervezas", parentFullCode: "01", isActive: true },
  { id: 3, level: 3, code: "010101", fullCode: "010101", name: "Nacionales", parentFullCode: "0101", isActive: true },
  { id: 4, level: 1, code: "02", fullCode: "02", name: "Alimentos", parentFullCode: null, isActive: true },
];

function cloneRow(row: ArticleClassificationRow): ArticleClassificationRow {
  return { ...row };
}

function ensureMockSeed(): void {
  if (!env.useMockData || mockStore.size > 0) {
    return;
  }
  const now = new Date().toISOString();
  for (const item of mockSeed) {
    const row: MutableClassificationRow = {
      ...item,
      createdAt: item.createdAt ?? now,
      updatedAt: item.updatedAt ?? now,
    };
    mockStore.set(item.id, row);
    mockSequence = Math.max(mockSequence, item.id);
  }
}

function sanitizeCode(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function sanitizeName(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeFullCode(value: string): string {
  return value.trim().toUpperCase();
}

export class ArticleClassificationService {
  constructor(private readonly repository: IArticleClassificationRepository = new ArticleClassificationRepository()) {}

  async list(filters: ArticleClassificationFilters = {}): Promise<ArticleClassificationRow[]> {
    if (env.useMockData) {
      ensureMockSeed();
      const includeInactive = filters.includeInactive ?? false;
      const items = Array.from(mockStore.values()).filter((row) => {
        if (!includeInactive && !row.isActive) return false;
        if (typeof filters.level === "number" && row.level !== filters.level) return false;
        if (filters.parentFullCode !== undefined) {
          const normalizedParent = filters.parentFullCode === null ? null : normalizeFullCode(filters.parentFullCode);
          if (normalizedParent === null) {
            if (row.parentFullCode !== null) return false;
          } else if (row.parentFullCode?.toUpperCase() !== normalizedParent) {
            return false;
          }
        }
        return true;
      });
      return items
        .slice()
        .sort((a, b) => a.fullCode.localeCompare(b.fullCode, "es-MX"))
        .map(cloneRow);
    }

    return this.repository.listClassifications(filters);
  }

  async getById(id: number): Promise<ArticleClassificationRow | null> {
    if (env.useMockData) {
      ensureMockSeed();
      const row = mockStore.get(id) ?? null;
      return row ? cloneRow(row) : null;
    }
    return this.repository.getById(id);
  }

  async getByFullCode(fullCode: string): Promise<ArticleClassificationRow | null> {
    if (!fullCode) {
      return null;
    }
    if (env.useMockData) {
      ensureMockSeed();
      const normalized = normalizeFullCode(fullCode);
      const row = Array.from(mockStore.values()).find((item) => item.fullCode.toUpperCase() === normalized);
      return row ? cloneRow(row) : null;
    }
    return this.repository.getByFullCode(normalizeFullCode(fullCode));
  }

  async create(params: CreateClassificationParams): Promise<ArticleClassificationRow> {
    const name = sanitizeName(params.name);
    if (!name) {
      throw new Error("El nombre de la clasificación es obligatorio");
    }

    const rawCode = sanitizeCode(params.code);
    if (!rawCode) {
      throw new Error("Captura un código alfanumérico válido");
    }

    const parentFullCode = params.parentFullCode ? normalizeFullCode(params.parentFullCode) : null;
    let parent: ArticleClassificationRow | null = null;
    if (parentFullCode) {
      parent = await this.getByFullCode(parentFullCode);
      if (!parent) {
        throw new Error("La clasificación padre no existe");
      }
    }

    let codeSegment = rawCode;
    if (parent && rawCode.startsWith(parent.fullCode)) {
      const candidate = rawCode.slice(parent.fullCode.length);
      codeSegment = candidate.length > 0 ? candidate : rawCode;
    }

    const level = parent ? parent.level + 1 : 1;
    if (level > MAX_LEVEL) {
      throw new Error(`Solo se permiten ${MAX_LEVEL} niveles de clasificación`);
    }

    const fullCode = `${parent ? parent.fullCode : ""}${codeSegment}`;
    if (fullCode.length > MAX_FULL_CODE_LENGTH) {
      throw new Error("El código completo supera el máximo de 24 caracteres");
    }

    const duplicate = await this.getByFullCode(fullCode);
    if (duplicate) {
      throw new Error("Ya existe una clasificación con ese código");
    }

    const isActive = params.isActive ?? true;
    const storedCode = fullCode;

    if (env.useMockData) {
      ensureMockSeed();
      const now = new Date().toISOString();
      mockSequence += 1;
      const row: MutableClassificationRow = {
        id: mockSequence,
        level,
        code: storedCode,
        fullCode,
        name,
        parentFullCode,
        isActive,
        createdAt: now,
        updatedAt: now,
      };
      mockStore.set(row.id, row);
      return cloneRow(row);
    }

    const created = await this.repository.createClassification({
      code: storedCode,
      name,
      level,
      fullCode,
      parentFullCode,
      isActive,
    });
    return created;
  }

  async update(id: number, params: UpdateClassificationParams): Promise<ArticleClassificationRow> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error("Clasificación no encontrada");
    }

    const nextName = sanitizeName(params.name);

    if (env.useMockData) {
      ensureMockSeed();
      const row = mockStore.get(id);
      if (!row) {
        throw new Error("Clasificación no encontrada");
      }
      if (nextName !== undefined) {
        row.name = nextName;
      }
      if (params.isActive !== undefined) {
        row.isActive = params.isActive;
      }
      row.updatedAt = new Date().toISOString();
      return cloneRow(row);
    }

    const updatePayload: UpdateArticleClassificationInput = {};
    if (nextName !== undefined) {
      updatePayload.name = nextName;
    }
    if (params.isActive !== undefined) {
      updatePayload.isActive = params.isActive;
    }

    if (Object.keys(updatePayload).length === 0) {
      return existing;
    }

    const updated = await this.repository.updateClassification(id, updatePayload);
    return updated;
  }
}
