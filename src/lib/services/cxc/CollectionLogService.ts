import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import {
  collectionLogRepository,
  type CollectionLogRepository,
  type CreateCollectionLogInput as RepositoryCreateCollectionLogInput,
} from "@/lib/repositories/cxc/CollectionLogRepository";
import { customerDocumentRepository, type CustomerDocumentRepository } from "@/lib/repositories/cxc/CustomerDocumentRepository";
import { customerRepository, type CustomerRepository } from "@/lib/repositories/cxc/CustomerRepository";
import type { CollectionLogDTO, CustomerDocumentDTO, CustomerDTO } from "@/lib/types/cxc";

import { mockCxcStore } from "./mock-data";

const normalizeOptionalString = (value: string | null | undefined, maxLength: number): string | null => {
  if (typeof value !== "string") {
    return value ?? null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed.slice(0, maxLength);
};

const parseFollowUpAt = (value: string | Date | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("La fecha de seguimiento no es válida");
  }
  return date.toISOString();
};

export type ListCollectionLogsOptions = {
  customerId: number;
  documentId?: number;
};

export type CreateCollectionLogPayload = {
  customerId: number;
  documentId?: number | null;
  contactMethod?: string | null;
  contactName?: string | null;
  notes?: string | null;
  outcome?: string | null;
  followUpAt?: string | Date | null;
  createdBy?: number | null;
};

export class CollectionLogService {
  constructor(
    private readonly repo: CollectionLogRepository = collectionLogRepository,
    private readonly customerRepo: CustomerRepository = customerRepository,
    private readonly documentRepo: CustomerDocumentRepository = customerDocumentRepository,
  ) {}

  private async ensureCustomer(customerId: number): Promise<CustomerDTO> {
    if (customerId <= 0) {
      throw new Error("Debe indicar el cliente");
    }

    if (env.useMockData) {
      const customer = mockCxcStore.customers.find((entry) => entry.id === customerId);
      if (!customer) {
        throw new Error("El cliente indicado no existe");
      }
      return { ...customer };
    }

    const customer = await this.customerRepo.findById(customerId);
    if (!customer) {
      throw new Error("El cliente indicado no existe");
    }
    return customer;
  }

  private async ensureDocumentBelongsToCustomer(customer: CustomerDTO, documentId: number | null | undefined): Promise<CustomerDocumentDTO | null> {
    if (!documentId) {
      return null;
    }

    if (env.useMockData) {
      const document = mockCxcStore.documents.find((entry) => entry.id === documentId);
      if (!document) {
        throw new Error("El documento indicado no existe");
      }
      if (document.customerId !== customer.id) {
        throw new Error("El documento no pertenece al cliente indicado");
      }
      return { ...document };
    }

    const document = await this.documentRepo.findById(documentId);
    if (!document) {
      throw new Error("El documento indicado no existe");
    }
    if (document.customerId !== customer.id) {
      throw new Error("El documento no pertenece al cliente indicado");
    }
    return document;
  }

  async list(options: ListCollectionLogsOptions): Promise<CollectionLogDTO[]> {
    const customer = await this.ensureCustomer(options.customerId);

    if (env.useMockData) {
      return mockCxcStore.collectionLogs
        .filter((entry) => entry.customerId === customer.id)
        .filter((entry) => (typeof options.documentId === "number" ? entry.documentId === options.documentId : true))
        .map((entry) => ({ ...entry }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    const rows = await this.repo.listByCustomer(customer.id);
    return rows
      .filter((entry) => (typeof options.documentId === "number" ? entry.documentId === options.documentId : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async create(input: CreateCollectionLogPayload): Promise<CollectionLogDTO> {
    const customer = await this.ensureCustomer(input.customerId);
    const document = await this.ensureDocumentBelongsToCustomer(customer, input.documentId ?? null);

    const payload = {
      customerId: customer.id,
      documentId: document ? document.id : null,
      contactMethod: normalizeOptionalString(input.contactMethod, 120),
      contactName: normalizeOptionalString(input.contactName, 160),
      notes: normalizeOptionalString(input.notes, 512),
      outcome: normalizeOptionalString(input.outcome, 240),
      followUpAt: parseFollowUpAt(input.followUpAt),
      createdBy: typeof input.createdBy === "number" ? input.createdBy : null,
    } satisfies CreateCollectionLogPayload;

    if (env.useMockData) {
      const log: CollectionLogDTO = {
        id: mockCxcStore.sequences.collectionLog++,
        customerId: payload.customerId,
        documentId: payload.documentId,
        contactMethod: payload.contactMethod,
        contactName: payload.contactName,
        notes: payload.notes,
        outcome: payload.outcome,
        followUpAt: payload.followUpAt,
        createdBy: payload.createdBy,
        createdAt: new Date().toISOString(),
      };
      mockCxcStore.collectionLogs.unshift(log);
      return { ...log };
    }

    const record = await prisma.$transaction((tx) =>
      this.repo.create(
        {
          customerId: payload.customerId,
          documentId: payload.documentId,
          contactMethod: payload.contactMethod,
          contactName: payload.contactName,
          notes: payload.notes,
          outcome: payload.outcome,
          followUpAt: payload.followUpAt,
          createdBy: payload.createdBy ?? undefined,
        } satisfies RepositoryCreateCollectionLogInput,
        tx,
      ),
    );

    return record;
  }

  async delete(id: number): Promise<void> {
    if (id <= 0) {
      throw new Error("Identificador inválido");
    }

    if (env.useMockData) {
      const index = mockCxcStore.collectionLogs.findIndex((entry) => entry.id === id);
      if (index === -1) {
        return;
      }
      mockCxcStore.collectionLogs.splice(index, 1);
      return;
    }

    await this.repo.delete(id);
  }
}

export const collectionLogService = new CollectionLogService();