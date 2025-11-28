import type { Prisma } from "@prisma/client";

import { env } from "@/lib/env";
import { prisma } from "@/lib/db/prisma";
import {
  customerDocumentApplicationRepository,
  type CreateCustomerDocumentApplicationInput,
  type CustomerDocumentApplicationRepository,
  type ListApplicationsOptions,
} from "@/lib/repositories/cxc/CustomerDocumentApplicationRepository";
import { customerDocumentRepository, type CustomerDocumentRepository } from "@/lib/repositories/cxc/CustomerDocumentRepository";
import type { CustomerDocumentApplicationDTO, CustomerDocumentDTO, CustomerDocumentType } from "@/lib/types/cxc";

import { mockCxcStore } from "./mock-data";
import { customerCreditLineService } from "./CustomerCreditLineService";

export type ApplyDocumentInput = Omit<CreateCustomerDocumentApplicationInput, "applicationDate"> & {
  applicationDate?: string | Date;
};

const getDocumentPriority = (type: CustomerDocumentType): number => {
  switch (type) {
    case "RETENTION":
      return 0;
    case "CREDIT_NOTE":
      return 1;
    case "ADJUSTMENT":
      return 2;
    case "RECEIPT":
      return 3;
    case "DEBIT_NOTE":
      return 4;
    case "INVOICE":
    default:
      return 5;
  }
};

const cloneApplication = (app: CustomerDocumentApplicationDTO): CustomerDocumentApplicationDTO => ({ ...app });

const isDebitDocumentType = (type: CustomerDocumentType): boolean => type === "INVOICE" || type === "DEBIT_NOTE";

export class CustomerDocumentApplicationService {
  constructor(
    private readonly repo: CustomerDocumentApplicationRepository = customerDocumentApplicationRepository,
    private readonly documentRepo: CustomerDocumentRepository = customerDocumentRepository,
  ) {}

  async list(options: ListApplicationsOptions = {}): Promise<CustomerDocumentApplicationDTO[]> {
    if (env.useMockData) {
      return mockCxcStore.applications
        .filter((app) => {
          if (typeof options.appliedDocumentId === "number" && app.appliedDocumentId !== options.appliedDocumentId) {
            return false;
          }
          if (typeof options.targetDocumentId === "number" && app.targetDocumentId !== options.targetDocumentId) {
            return false;
          }
          return true;
        })
        .map(cloneApplication);
    }

    return this.repo.list(options);
  }

  private validateApplicationAmounts(applied: CustomerDocumentDTO, target: CustomerDocumentDTO, amount: number) {
    if (amount <= 0) {
      throw new Error("El monto aplicado debe ser mayor a cero");
    }
    if (applied.customerId !== target.customerId) {
      throw new Error("Los documentos deben pertenecer al mismo cliente");
    }
    if (target.status === "PAGADO") {
      throw new Error("El documento objetivo ya está pagado");
    }
    if (amount > applied.balanceAmount + 0.0001) {
      throw new Error("El monto excede el saldo disponible del documento aplicado");
    }
    if (amount > target.balanceAmount + 0.0001) {
      throw new Error("El monto excede el saldo pendiente del documento objetivo");
    }
  }

  private getSortedInputs(inputs: ApplyDocumentInput[], appliedDocsMap: Map<number, CustomerDocumentDTO>): ApplyDocumentInput[] {
    return [...inputs].sort((a, b) => {
      const docA = appliedDocsMap.get(a.appliedDocumentId);
      const docB = appliedDocsMap.get(b.appliedDocumentId);
      const priorityA = docA ? getDocumentPriority(docA.documentType) : Number.MAX_SAFE_INTEGER;
      const priorityB = docB ? getDocumentPriority(docB.documentType) : Number.MAX_SAFE_INTEGER;
      return priorityA - priorityB;
    });
  }

  private normalizeApplicationDate(value?: string | Date): Date {
    if (!value) return new Date();
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error("Fecha de aplicación inválida");
    }
    return parsed;
  }

  async apply(inputs: ApplyDocumentInput[]): Promise<CustomerDocumentApplicationDTO[]> {
    if (inputs.length === 0) {
      return [];
    }

    if (env.useMockData) {
      return this.applyInMock(inputs);
    }

    return prisma.$transaction(async (tx) => this.applyInDatabase(inputs, tx));
  }

  private async applyInDatabase(inputs: ApplyDocumentInput[], tx: Prisma.TransactionClient): Promise<CustomerDocumentApplicationDTO[]> {
    const appliedDocsMap = new Map<number, CustomerDocumentDTO>();
    for (const input of inputs) {
      if (!appliedDocsMap.has(input.appliedDocumentId)) {
        const doc = await this.documentRepo.findById(input.appliedDocumentId, tx);
        if (!doc) {
          throw new Error(`El documento aplicado ${input.appliedDocumentId} no existe`);
        }
        appliedDocsMap.set(doc.id, doc);
      }
    }

    const sortedInputs = this.getSortedInputs(inputs, appliedDocsMap);
    const results: CustomerDocumentApplicationDTO[] = [];
    const targetCache = new Map<number, CustomerDocumentDTO>();
    const customersToSync = new Set<number>();

    for (const input of sortedInputs) {
      const applied = appliedDocsMap.get(input.appliedDocumentId) ?? (await this.documentRepo.findById(input.appliedDocumentId, tx));
      if (!applied) {
        throw new Error(`El documento aplicado ${input.appliedDocumentId} no existe`);
      }
      appliedDocsMap.set(applied.id, applied);

      let target = targetCache.get(input.targetDocumentId);
      if (!target) {
        const fetched = await this.documentRepo.findById(input.targetDocumentId, tx);
        if (!fetched) {
          throw new Error(`El documento objetivo ${input.targetDocumentId} no existe`);
        }
        targetCache.set(fetched.id, fetched);
        target = fetched;
      }

      const amount = input.amount;
      this.validateApplicationAmounts(applied, target, amount);

      const application = await this.repo.create(
        {
          appliedDocumentId: applied.id,
          targetDocumentId: target.id,
          amount,
          applicationDate: this.normalizeApplicationDate(input.applicationDate),
          reference: input.reference ?? null,
          notes: input.notes ?? null,
        },
        tx,
      );
      results.push(application);

      const updatedApplied = await this.documentRepo.adjustBalance(applied.id, -amount, tx);
      applied.balanceAmount = updatedApplied.balanceAmount;
      applied.status = updatedApplied.status;
      if (updatedApplied.balanceAmount <= 0 && updatedApplied.status !== "PAGADO") {
        await this.documentRepo.setStatus(applied.id, "PAGADO", tx);
        applied.status = "PAGADO";
      }

      const updatedTarget = await this.documentRepo.adjustBalance(target.id, -amount, tx);
      target.balanceAmount = updatedTarget.balanceAmount;
      target.status = updatedTarget.status;
      if (updatedTarget.balanceAmount <= 0 && updatedTarget.status !== "PAGADO") {
        await this.documentRepo.setStatus(target.id, "PAGADO", tx);
        target.status = "PAGADO";
      } else if (updatedTarget.balanceAmount > 0 && target.status === "PAGADO") {
        await this.documentRepo.setStatus(target.id, "PENDIENTE", tx);
        target.status = "PENDIENTE";
      }

      if (env.features.retailModeEnabled) {
        if (isDebitDocumentType(applied.documentType)) {
          customersToSync.add(applied.customerId);
        }
        if (isDebitDocumentType(target.documentType)) {
          customersToSync.add(target.customerId);
        }
      }
    }

    if (env.features.retailModeEnabled && customersToSync.size > 0) {
      for (const customerId of customersToSync) {
        await customerCreditLineService.syncCustomerCreditUsageByCustomerId(customerId, { tx });
      }
    }

    return results;
  }

  private async applyInMock(inputs: ApplyDocumentInput[]): Promise<CustomerDocumentApplicationDTO[]> {
    const appliedDocsMap = new Map<number, CustomerDocumentDTO>();
    for (const doc of mockCxcStore.documents) {
      appliedDocsMap.set(doc.id, doc);
    }
    const sortedInputs = this.getSortedInputs(inputs, appliedDocsMap);
    const results: CustomerDocumentApplicationDTO[] = [];
    const customersToSync = new Set<number>();

    for (const input of sortedInputs) {
      const applied = mockCxcStore.documents.find((doc) => doc.id === input.appliedDocumentId);
      const target = mockCxcStore.documents.find((doc) => doc.id === input.targetDocumentId);
      if (!applied || !target) {
        throw new Error("Los documentos indicados no existen en los datos de prueba");
      }
      this.validateApplicationAmounts(applied, target, input.amount);

      applied.balanceAmount = Math.max(0, Number((applied.balanceAmount - input.amount).toFixed(2)));
      target.balanceAmount = Math.max(0, Number((target.balanceAmount - input.amount).toFixed(2)));
      if (applied.balanceAmount <= 0) {
        applied.status = "PAGADO";
      }
      if (target.balanceAmount <= 0) {
        target.status = "PAGADO";
      } else if (target.status === "PAGADO") {
        target.status = "PENDIENTE";
      }

      if (env.features.retailModeEnabled) {
        if (isDebitDocumentType(applied.documentType)) {
          customersToSync.add(applied.customerId);
        }
        if (isDebitDocumentType(target.documentType)) {
          customersToSync.add(target.customerId);
        }
      }

      const application: CustomerDocumentApplicationDTO = {
        id: mockCxcStore.sequences.application++,
        appliedDocumentId: applied.id,
        targetDocumentId: target.id,
        amount: input.amount,
        applicationDate: this.normalizeApplicationDate(input.applicationDate).toISOString(),
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        createdAt: new Date().toISOString(),
      };
      mockCxcStore.applications.push(application);
      results.push(cloneApplication(application));
    }

    if (env.features.retailModeEnabled && customersToSync.size > 0) {
      for (const customerId of customersToSync) {
        await customerCreditLineService.syncCustomerCreditUsageByCustomerId(customerId);
      }
    }

    return results;
  }

  async delete(applicationId: number): Promise<void> {
    if (env.useMockData) {
      const index = mockCxcStore.applications.findIndex((entry) => entry.id === applicationId);
      if (index === -1) {
        return;
      }
      const application = mockCxcStore.applications[index];
      const applied = mockCxcStore.documents.find((doc) => doc.id === application.appliedDocumentId);
      const target = mockCxcStore.documents.find((doc) => doc.id === application.targetDocumentId);
      if (applied) {
        applied.balanceAmount = Number((applied.balanceAmount + application.amount).toFixed(2));
        if (applied.balanceAmount > 0 && applied.status === "PAGADO") {
          applied.status = "PENDIENTE";
        }
      }
      if (target) {
        target.balanceAmount = Number((target.balanceAmount + application.amount).toFixed(2));
        if (target.balanceAmount > 0 && target.status === "PAGADO") {
          target.status = "PENDIENTE";
        }
      }
      mockCxcStore.applications.splice(index, 1);

       if (env.features.retailModeEnabled) {
         const customersToSync = new Set<number>();
         if (applied && isDebitDocumentType(applied.documentType)) {
           customersToSync.add(applied.customerId);
         }
         if (target && isDebitDocumentType(target.documentType)) {
           customersToSync.add(target.customerId);
         }
         for (const customerId of customersToSync) {
           await customerCreditLineService.syncCustomerCreditUsageByCustomerId(customerId);
         }
       }
      return;
    }

    await prisma.$transaction(async (tx) => {
      const application = await this.repo.findById(applicationId, tx);
      if (!application) {
        return;
      }
      await this.repo.delete(applicationId, tx);
      const applied = await this.documentRepo.adjustBalance(application.appliedDocumentId, application.amount, tx);
      if (applied.balanceAmount > 0 && applied.status === "PAGADO") {
        await this.documentRepo.setStatus(applied.id, "PENDIENTE", tx);
      }
      const target = await this.documentRepo.adjustBalance(application.targetDocumentId, application.amount, tx);
      if (target.balanceAmount > 0 && target.status === "PAGADO") {
        await this.documentRepo.setStatus(target.id, "PENDIENTE", tx);
      }

      if (env.features.retailModeEnabled) {
        const customersToSync = new Set<number>();
        if (isDebitDocumentType(applied.documentType)) {
          customersToSync.add(applied.customerId);
        }
        if (isDebitDocumentType(target.documentType)) {
          customersToSync.add(target.customerId);
        }
        for (const customerId of customersToSync) {
          await customerCreditLineService.syncCustomerCreditUsageByCustomerId(customerId, { tx });
        }
      }
    });
  }
}

export const customerDocumentApplicationService = new CustomerDocumentApplicationService();
