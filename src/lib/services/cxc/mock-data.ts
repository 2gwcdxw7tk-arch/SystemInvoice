import type {
  CollectionLogDTO,
  CustomerCreditLineDTO,
  CustomerDTO,
  CustomerDocumentApplicationDTO,
  CustomerDocumentDTO,
  CustomerDisputeDTO,
  PaymentTermDTO,
} from "@/lib/types/cxc";

const now = new Date();
const isoNow = now.toISOString();

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

const addDays = (date: Date, days: number) => {
  const clone = new Date(date.getTime());
  clone.setUTCDate(clone.getUTCDate() + days);
  return clone;
};

export type MockCxcStore = {
  paymentTerms: PaymentTermDTO[];
  customers: CustomerDTO[];
  documents: CustomerDocumentDTO[];
  applications: CustomerDocumentApplicationDTO[];
  creditLines: CustomerCreditLineDTO[];
  collectionLogs: CollectionLogDTO[];
  disputes: CustomerDisputeDTO[];
  sequences: {
    paymentTerm: number;
    customer: number;
    document: number;
    application: number;
    creditLine: number;
    collectionLog: number;
    dispute: number;
  };
};

const initialPaymentTerms: PaymentTermDTO[] = [
  {
    id: 1,
    code: "CONTADO",
    name: "Contado",
    description: "Pago inmediato",
    days: 0,
    graceDays: 0,
    isActive: true,
    createdAt: isoNow,
    updatedAt: isoNow,
  },
  {
    id: 2,
    code: "NETO15",
    name: "Neto 15",
    description: "Crédito a 15 días",
    days: 15,
    graceDays: 0,
    isActive: true,
    createdAt: isoNow,
    updatedAt: isoNow,
  },
  {
    id: 3,
    code: "NETO30",
    name: "Neto 30",
    description: "Crédito a 30 días",
    days: 30,
    graceDays: 5,
    isActive: true,
    createdAt: isoNow,
    updatedAt: isoNow,
  },
];

const initialCustomers: CustomerDTO[] = [
  {
    id: 1,
    code: "MOSTRADOR",
    name: "Ventas de mostrador",
    tradeName: null,
    taxId: null,
    email: null,
    phone: null,
    mobilePhone: null,
    billingAddress: null,
    city: null,
    state: null,
    countryCode: "NI",
    postalCode: null,
    paymentTermId: 1,
    paymentTermCode: "CONTADO",
    creditLimit: 0,
    creditUsed: 0,
    creditOnHold: 0,
    creditStatus: "ACTIVE",
    creditHoldReason: null,
    lastCreditReviewAt: null,
    nextCreditReviewAt: null,
    isActive: true,
    notes: "Cliente genérico para ventas de contado",
    createdAt: isoNow,
    updatedAt: isoNow,
  },
  {
    id: 2,
    code: "RET001",
    name: "Retail Demo 001",
    tradeName: "Retail Demo",
    taxId: "J03123123",
    email: "demo@example.com",
    phone: "505-2222-2222",
    mobilePhone: "505-8888-8888",
    billingAddress: "Calle Principal 1",
    city: "Managua",
    state: "Managua",
    countryCode: "NI",
    postalCode: "11001",
    paymentTermId: 2,
    paymentTermCode: "NETO15",
    creditLimit: 5000,
    creditUsed: 1200,
    creditOnHold: 0,
    creditStatus: "ACTIVE",
    creditHoldReason: null,
    lastCreditReviewAt: isoNow,
    nextCreditReviewAt: addDays(now, 90).toISOString(),
    isActive: true,
    notes: null,
    createdAt: isoNow,
    updatedAt: isoNow,
  },
];

const initialCreditLines: CustomerCreditLineDTO[] = [
  {
    id: 1,
    customerId: 2,
    status: "ACTIVE",
    approvedLimit: 5000,
    availableLimit: 3800,
    blockedAmount: 0,
    reviewerAdminUserId: null,
    reviewNotes: "Línea inicial retail demo",
    reviewedAt: isoNow,
    nextReviewAt: addDays(now, 90).toISOString(),
    createdAt: isoNow,
    updatedAt: isoNow,
  },
];

const initialCollectionLogs: CollectionLogDTO[] = [];

const initialDisputes: CustomerDisputeDTO[] = [];

const initialDocuments: CustomerDocumentDTO[] = [
  {
    id: 1,
    customerId: 2,
    customerCode: "RET001",
    customerName: "Retail Demo 001",
    documentType: "INVOICE",
    documentNumber: "INV-MOCK-1",
    documentDate: formatDate(now),
    dueDate: formatDate(addDays(now, 15)),
    currencyCode: "NIO",
    originalAmount: 1500,
    balanceAmount: 900,
    status: "PENDIENTE",
    reference: "Pedido 10001",
    notes: null,
    metadata: null,
    paymentTermId: 2,
    paymentTermCode: "NETO15",
    relatedInvoiceId: 1001,
    createdAt: isoNow,
    updatedAt: isoNow,
  },
  {
    id: 2,
    customerId: 2,
    customerCode: "RET001",
    customerName: "Retail Demo 001",
    documentType: "RETENTION",
    documentNumber: "RET-MOCK-1",
    documentDate: formatDate(now),
    dueDate: formatDate(addDays(now, 15)),
    currencyCode: "NIO",
    originalAmount: 200,
    balanceAmount: 200,
    status: "PENDIENTE",
    reference: null,
    notes: "Retención fiscal",
    metadata: null,
    paymentTermId: 2,
    paymentTermCode: "NETO15",
    relatedInvoiceId: null,
    createdAt: isoNow,
    updatedAt: isoNow,
  },
  {
    id: 3,
    customerId: 2,
    customerCode: "RET001",
    customerName: "Retail Demo 001",
    documentType: "RECEIPT",
    documentNumber: "ROC-MOCK-1",
    documentDate: formatDate(now),
    dueDate: formatDate(now),
    currencyCode: "NIO",
    originalAmount: 600,
    balanceAmount: 600,
    status: "PENDIENTE",
    reference: null,
    notes: "Pago parcial",
    metadata: null,
    paymentTermId: null,
    paymentTermCode: null,
    relatedInvoiceId: null,
    createdAt: isoNow,
    updatedAt: isoNow,
  },
];

export const mockCxcStore: MockCxcStore = {
  paymentTerms: initialPaymentTerms,
  customers: initialCustomers,
  documents: initialDocuments,
  applications: [],
  creditLines: initialCreditLines,
  collectionLogs: initialCollectionLogs,
  disputes: initialDisputes,
  sequences: {
    paymentTerm: initialPaymentTerms.length + 1,
    customer: initialCustomers.length + 1,
    document: initialDocuments.length + 1,
    application: 1,
    creditLine: initialCreditLines.length + 1,
    collectionLog: 1,
    dispute: 1,
  },
};
