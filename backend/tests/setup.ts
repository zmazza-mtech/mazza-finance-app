// Test environment setup — sets required env vars before any modules load
process.env.CORS_ORIGIN = 'https://localhost';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.SIMPLEFIN_ACCESS_URL = 'https://testuser:testpass@beta-bridge.simplefin.org/simplefin';
