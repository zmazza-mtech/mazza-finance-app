/**
 * Just-in-time user provisioning (#76).
 *
 * A verified token is the only evidence a user exists. There is no sign-up
 * endpoint and no user table to seed — migration 0001 deliberately seeds none,
 * because a hand-made row is one no sign-in could ever claim.
 */
import { eq } from 'drizzle-orm';
import { householdMemberships, users } from '../db/schema.js';
import { currentHouseholdId } from '../db/household.js';
import type { getDb } from '../db/client.js';
import type { VerifiedClaims } from './jwt.js';

type Db = ReturnType<typeof getDb>;

export interface ProvisionedUser {
  id: string;
  authSubject: string;
  email: string;
}

/**
 * Returns the user for a verified token, creating them on first sight.
 *
 * Identity is the `sub` claim, never the email. An email is a mutable
 * attribute of an identity — matching on it would fork the account the day
 * someone changes their address, leaving their money behind under the old row.
 *
 * The first person into a household is its owner and everyone after is a
 * member. Until #90 adds invitations that is the only rule there is, and it
 * gives the household exactly one owner rather than none.
 */
export async function provisionUser(
  db: Db,
  claims: VerifiedClaims,
): Promise<ProvisionedUser> {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.authSubject, claims.sub))
    .limit(1);

  if (existing.length > 0) {
    const user = existing[0]!;

    // The provider is authoritative on the email, so a change follows through
    // rather than leaving a stale copy that disagrees with the sign-in screen.
    if (claims.email && claims.email !== user.email) {
      await db.update(users).set({ email: claims.email }).where(eq(users.id, user.id));
      return { id: user.id, authSubject: user.authSubject, email: claims.email };
    }

    return { id: user.id, authSubject: user.authSubject, email: user.email };
  }

  const inserted = await db
    .insert(users)
    .values({ authSubject: claims.sub, email: claims.email })
    .returning();

  const user = inserted[0]!;
  const householdId = currentHouseholdId();

  const existingMembers = await db
    .select({ id: householdMemberships.id })
    .from(householdMemberships)
    .where(eq(householdMemberships.householdId, householdId))
    .limit(1);

  await db.insert(householdMemberships).values({
    householdId,
    userId: user.id,
    role: existingMembers.length === 0 ? 'owner' : 'member',
  });

  return { id: user.id, authSubject: user.authSubject, email: user.email };
}
