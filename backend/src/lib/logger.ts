import winston from 'winston';

// Patterns that must never appear in log output
const SENSITIVE_PATTERNS = [
  /ENCRYPTION_KEY\s*[:=]\s*\S+/gi,
  /DATABASE_URL\s*[:=]\s*\S+/gi,
  /password\s*[:=]\s*\S+/gi,
  /Authorization:\s*Bearer\s+\S+/gi,
  /access_token\s*[:=]\s*\S+/gi,
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g,
  // AES-256-GCM stored token format: <24-hex>:<hex>:<32-hex>
  /[0-9a-f]{24}:[0-9a-f]+:[0-9a-f]{32}/gi,
];

function sanitize(value: unknown): unknown {
  if (typeof value === 'string') {
    let sanitized = value;
    for (const pattern of SENSITIVE_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    }
    return sanitized;
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      // Redact any key that looks like a credential
      if (/key|secret|token|password|authorization|credential/i.test(k)) {
        result[k] = '[REDACTED]';
      } else {
        result[k] = sanitize(v);
      }
    }
    return result;
  }
  return value;
}

const sanitizeTransform = winston.format((info) => {
  return sanitize(info) as winston.Logform.TransformableInfo;
});

export const logger = winston.createLogger({
  level: process.env['LOG_LEVEL'] ?? 'info',
  format: winston.format.combine(
    sanitizeTransform(),
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: [new winston.transports.Console()],
});
