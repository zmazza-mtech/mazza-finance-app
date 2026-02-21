// Test environment setup — sets required env vars before any modules load
process.env.CORS_ORIGIN = 'https://localhost';
process.env.ENCRYPTION_KEY = 'a'.repeat(64); // 32-byte hex for tests
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.TELLER_CERT_PATH = '/dev/null';
process.env.TELLER_KEY_PATH = '/dev/null';
