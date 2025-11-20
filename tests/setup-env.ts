// Ensure required environment variables exist for tests before modules import env.ts
process.env.MOCK_DATA = process.env.MOCK_DATA || 'false';
process.env.NEXT_APP_URL = process.env.NEXT_APP_URL || 'http://localhost:3000';
process.env.NEXT_PUBLIC_COMPANY_NAME = process.env.NEXT_PUBLIC_COMPANY_NAME || 'Test Company';
process.env.NEXT_PUBLIC_COMPANY_ADDRESS = process.env.NEXT_PUBLIC_COMPANY_ADDRESS || '123 Test Street';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'abcdefghijklmnopqrstuvwxyz012345'; // 33 chars
// Optional public currency settings for deterministic defaults
process.env.NEXT_PUBLIC_LOCAL_CURRENCY_CODE = process.env.NEXT_PUBLIC_LOCAL_CURRENCY_CODE || 'MXN';
process.env.NEXT_PUBLIC_LOCAL_CURRENCY_SYMBOL = process.env.NEXT_PUBLIC_LOCAL_CURRENCY_SYMBOL || '$';
process.env.NEXT_PUBLIC_FOREIGN_CURRENCY_CODE = process.env.NEXT_PUBLIC_FOREIGN_CURRENCY_CODE || 'USD';
process.env.NEXT_PUBLIC_FOREIGN_CURRENCY_SYMBOL = process.env.NEXT_PUBLIC_FOREIGN_CURRENCY_SYMBOL || '$';
// Provide a dummy DB URL so prisma client can initialize lazily without connecting
process.env.DB_CONNECTION_STRING = process.env.DB_CONNECTION_STRING || 'postgresql://user:pass@localhost:5432/testdb?schema=app';
process.env.DATABASE_URL = process.env.DATABASE_URL || process.env.DB_CONNECTION_STRING;
