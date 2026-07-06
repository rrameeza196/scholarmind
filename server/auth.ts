import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { OAuth2Client } from 'google-auth-library';
import {
  getUserById,
  getUserByGoogleId,
  upsertUser,
  createSession,
  getUserIdForSession,
  deleteSession
} from './dbStore.js';
import { AuthUser } from '../src/types.js';

export const SESSION_COOKIE_NAME = 'sm_session';
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

let oauthClient: OAuth2Client | null = null;

function getOAuthClient(): OAuth2Client {
  if (!oauthClient) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new Error('GOOGLE_CLIENT_ID is not configured on the server.');
    }
    oauthClient = new OAuth2Client(clientId);
  }
  return oauthClient;
}

/** Standard cookie options for the session cookie — httpOnly so client JS
 * can't read it, secure in production (requires HTTPS), lax sameSite since
 * everything is same-origin (frontend + API share one Express server). */
function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE_MS
  };
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions());
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE_NAME, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
}

/**
 * Verifies a Google "Sign In With Google" ID token (JWT credential from the
 * Google Identity Services button), and returns the verified profile.
 * Throws if the token is invalid, expired, or was issued for a different
 * client ID than the one configured on this server.
 */
export async function verifyGoogleCredential(idToken: string): Promise<{ googleId: string; name: string; email: string; picture?: string }> {
  const client = getOAuthClient();
  const ticket = await client.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID
  });
  const payload = ticket.getPayload();
  if (!payload || !payload.sub || !payload.email) {
    throw new Error('Invalid Google credential payload.');
  }
  return {
    googleId: payload.sub,
    name: payload.name || payload.email.split('@')[0],
    email: payload.email,
    picture: payload.picture
  };
}

/** Verifies the Google credential, creates/updates the user record, starts a
 * new session, and returns both the user and the session token to cookie. */
export async function signInWithGoogle(idToken: string): Promise<{ user: AuthUser; sessionToken: string }> {
  const profile = await verifyGoogleCredential(idToken);

  let user = await getUserByGoogleId(profile.googleId);
  user = await upsertUser({
    id: profile.googleId,
    name: profile.name,
    email: profile.email,
    picture: profile.picture,
    isGuest: false
  });

  const sessionToken = randomUUID();
  await createSession(user.id, sessionToken);

  return { user, sessionToken };
}

/** Creates a brand new anonymous guest user + session, so people can try the
 * app without a Google account. Guest data is isolated the same way real
 * user data is — it's just not tied to a persistent identity. */
export async function createGuestSession(): Promise<{ user: AuthUser; sessionToken: string }> {
  const guestId = 'guest_' + randomUUID();
  const user: AuthUser = {
    id: guestId,
    name: 'Guest',
    email: '',
    isGuest: true
  };
  await upsertUser(user);

  const sessionToken = randomUUID();
  await createSession(user.id, sessionToken);

  return { user, sessionToken };
}

export async function logout(sessionToken: string | undefined): Promise<void> {
  if (sessionToken) {
    await deleteSession(sessionToken);
  }
}

export async function resolveUserFromRequest(req: Request): Promise<AuthUser | null> {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (!token) return null;

  const userId = await getUserIdForSession(token);
  if (!userId) return null;

  const user = await getUserById(userId);
  return user || null;
}

// Extend Express's Request type so route handlers can read req.user directly.
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Express middleware that requires a valid session. Attaches the resolved
 * user to `req.user` on success, or responds 401 if there's no valid
 * session — the frontend treats 401 as "show the sign-in screen". */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await resolveUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Not signed in.' });
    }
    req.user = user;
    next();
  } catch (error) {
    console.error('Error resolving session:', error);
    res.status(401).json({ error: 'Not signed in.' });
  }
}
