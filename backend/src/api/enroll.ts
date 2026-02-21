import { Router, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { accounts, tellerCredentials } from '../db/schema';
import { encrypt } from '../lib/crypto';
import { listAccounts } from '../lib/teller-client';
import { EnrollAccountSchema } from '../lib/validate';
import { logger } from '../lib/logger';

const router = Router();

// POST /enroll
// Receives accessToken + enrollmentId from Teller Connect callback.
// Encrypts the token, upserts the credential, then syncs accounts immediately.
router.post('/', async (req: Request, res: Response) => {
  const parsed = EnrollAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: parsed.error.flatten() });
  }

  const { accessToken, enrollmentId } = parsed.data;
  const encryptionKey = process.env.ENCRYPTION_KEY!;

  try {
    const db = getDb();

    // Encrypt and upsert credential
    const encryptedToken = encrypt(accessToken, encryptionKey);
    await db
      .insert(tellerCredentials)
      .values({ accessToken: encryptedToken, enrollmentId })
      .onConflictDoUpdate({
        target: tellerCredentials.enrollmentId,
        set: { accessToken: encryptedToken, updatedAt: new Date() },
      });

    // Fetch accounts from Teller and upsert
    const tellerAccounts = await listAccounts(accessToken);

    for (const ta of tellerAccounts) {
      await db
        .insert(accounts)
        .values({
          tellerId: ta.id,
          institution: ta.institution.name,
          name: ta.name,
          type: mapAccountType(ta.type),
          subtype: ta.subtype,
          currency: ta.currency,
        })
        .onConflictDoUpdate({
          target: accounts.tellerId,
          set: {
            institution: ta.institution.name,
            name: ta.name,
            updatedAt: new Date(),
          },
        });
    }

    logger.info('Enrollment complete', { enrollmentId, accountCount: tellerAccounts.length });
    res.status(201).json({ data: { enrolled: true }, error: null });
  } catch (err) {
    logger.error('Enrollment failed', { err });
    res.status(500).json({ data: null, error: 'Enrollment failed' });
  }
});

function mapAccountType(tellerType: string): 'checking' | 'savings' | 'credit' {
  if (tellerType === 'credit') return 'credit';
  if (tellerType === 'savings') return 'savings';
  return 'checking';
}

export default router;
