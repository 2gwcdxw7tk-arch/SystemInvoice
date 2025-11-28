export type PaymentTermDTO = {
	id: number;
	code: string;
	name: string;
	description: string | null;
	days: number;
	graceDays: number | null;
	isActive: boolean;
	createdAt: string;
	updatedAt: string | null;
};

export type CustomerDTO = {
	id: number;
	code: string;
	name: string;
	tradeName: string | null;
	taxId: string | null;
	email: string | null;
	phone: string | null;
	mobilePhone: string | null;
	billingAddress: string | null;
	city: string | null;
	state: string | null;
	countryCode: string | null;
	postalCode: string | null;
	paymentTermId: number | null;
	paymentTermCode: string | null;
	creditLimit: number;
	creditUsed: number;
	creditOnHold: number;
	creditStatus: "ACTIVE" | "ON_HOLD" | "BLOCKED";
	creditHoldReason: string | null;
	lastCreditReviewAt: string | null;
	nextCreditReviewAt: string | null;
	isActive: boolean;
	notes: string | null;
	createdAt: string;
	updatedAt: string | null;
};

export type CustomerSummaryDTO = Pick<
	CustomerDTO,
	| "id"
	| "code"
	| "name"
	| "taxId"
	| "paymentTermCode"
	| "creditLimit"
	| "creditUsed"
	| "creditOnHold"
	| "creditStatus"
> & { availableCredit: number };

export type CustomerDocumentType =
	| "INVOICE"
	| "CREDIT_NOTE"
	| "DEBIT_NOTE"
	| "RECEIPT"
	| "RETENTION"
	| "ADJUSTMENT";

export type CustomerDocumentStatus = "PENDIENTE" | "PAGADO" | "CANCELADO" | "BORRADOR";

export type CustomerDocumentDTO = {
	id: number;
	customerId: number;
	customerCode: string;
	customerName: string;
	documentType: CustomerDocumentType;
	documentNumber: string;
	documentDate: string;
	dueDate: string | null;
	currencyCode: string;
	originalAmount: number;
	balanceAmount: number;
	status: CustomerDocumentStatus;
	reference: string | null;
	notes: string | null;
	metadata: Record<string, unknown> | null;
	paymentTermId: number | null;
	paymentTermCode: string | null;
	relatedInvoiceId: number | null;
	createdAt: string;
	updatedAt: string | null;
};

export type CustomerDocumentApplicationDTO = {
	id: number;
	appliedDocumentId: number;
	targetDocumentId: number;
	applicationDate: string;
	amount: number;
	reference: string | null;
	notes: string | null;
	createdAt: string;
};

export type CustomerCreditLineDTO = {
	id: number;
	customerId: number;
	status: "ACTIVE" | "PAUSED" | "BLOCKED";
	approvedLimit: number;
	availableLimit: number;
	blockedAmount: number;
	reviewerAdminUserId: number | null;
	reviewNotes: string | null;
	reviewedAt: string | null;
	nextReviewAt: string | null;
	createdAt: string;
	updatedAt: string | null;
};

export type CollectionLogDTO = {
	id: number;
	customerId: number;
	documentId: number | null;
	contactMethod: string | null;
	contactName: string | null;
	notes: string | null;
	outcome: string | null;
	followUpAt: string | null;
	createdBy: number | null;
	createdAt: string;
};

export type CustomerDisputeDTO = {
	id: number;
	customerId: number;
	documentId: number | null;
	disputeCode: string | null;
	description: string | null;
	status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
	resolutionNotes: string | null;
	resolvedAt: string | null;
	createdBy: number | null;
	createdAt: string;
	updatedAt: string | null;
};
