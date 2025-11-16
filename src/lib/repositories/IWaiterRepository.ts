export type WaiterUser = {
  id: number;
  code: string;
  fullName: string;
};

export type WaiterDirectoryEntry = WaiterUser & {
  phone: string | null;
  email: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string | null;
};

export type VerifyWaiterPinResult = {
  success: boolean;
  waiter?: WaiterUser;
  message: string;
};

export type VerifyWaiterPinMeta = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type CreateWaiterParams = {
  code: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  pin: string;
  isActive?: boolean;
};

export type UpdateWaiterParams = {
  code?: string;
  fullName?: string;
  phone?: string | null;
  email?: string | null;
  isActive?: boolean;
};

export interface IWaiterRepository {
  verifyWaiterPin(pin: string, meta: VerifyWaiterPinMeta): Promise<VerifyWaiterPinResult>;
  getWaiterById(waiterId: number): Promise<WaiterUser | null>;
  listWaiterDirectory(options: { includeInactive?: boolean }): Promise<WaiterDirectoryEntry[]>;
  createWaiterDirectoryEntry(params: CreateWaiterParams): Promise<WaiterDirectoryEntry>;
  updateWaiterDirectoryEntry(waiterId: number, params: UpdateWaiterParams): Promise<WaiterDirectoryEntry>;
  resetWaiterPin(waiterId: number, newPin: string): Promise<WaiterDirectoryEntry>;
}
