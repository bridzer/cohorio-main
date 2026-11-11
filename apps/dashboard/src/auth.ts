import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { z } from "zod";
import { cohorioAuthAdapter } from "@/lib/auth/adapter";
import {
  activateOAuthUser,
  consumeSessionBootstrapToken,
  getCredentialUser,
  getUserByAccount,
  getUserByEmail,
  getUserById,
  recordLoginFailure,
  recordLoginSuccess,
} from "@/lib/auth/repository";
import {
  hashPassword,
  hashToken,
  normalizeEmail,
  verifyPassword,
} from "@/lib/auth/security";

const credentialSchema = z
  .object({
    email: z.string().email().max(320).optional(),
    password: z.string().min(1).max(200).optional(),
    completionToken: z.string().min(20).max(200).optional(),
  })
  .refine(
    (value) =>
      Boolean(value.completionToken) ||
      (Boolean(value.email) && Boolean(value.password)),
  );
const dummyPasswordHash = hashPassword(
  "Cohorio-Dummy-Password-For-Constant-Time-Verification-2026",
);
const googleClientId =
  process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_OAUTH_CLIENT_ID;
const googleClientSecret =
  process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_OAUTH_CLIENT_SECRET;

// After a store connects, merchants open this app inside the Shopify admin
// iframe, where Auth.js cookies are third-party. With the default
// SameSite=Lax cookies, the browser never stores or sends them in that
// frame: the CSRF cookie set by GET /api/auth/csrf is missing from the
// credentials POST (Auth.js throws MissingCSRF) and no session can persist.
// In production, issue the auth cookies as cross-site CHIPS cookies
// (SameSite=None + Secure + Partitioned) so Chrome-based embedded sessions
// work. Browsers that block third-party cookies outright are covered by the
// auth pages escaping the iframe to a top-level window (see EscapeIframe).
// Development keeps the Auth.js defaults so plain-http localhost sign-in
// keeps working.
const embeddedCookieOptions = {
  httpOnly: true,
  sameSite: "none",
  path: "/",
  secure: true,
  partitioned: true,
} as const;
const authCookies: NextAuthConfig["cookies"] =
  process.env.NODE_ENV === "production"
    ? {
        sessionToken: { options: embeddedCookieOptions },
        callbackUrl: { options: embeddedCookieOptions },
        csrfToken: { options: embeddedCookieOptions },
        pkceCodeVerifier: {
          options: { ...embeddedCookieOptions, maxAge: 60 * 15 },
        },
        state: { options: { ...embeddedCookieOptions, maxAge: 60 * 15 } },
        nonce: { options: embeddedCookieOptions },
      }
    : undefined;

const providers: NextAuthConfig["providers"] = [
  Credentials({
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
      completionToken: { label: "Completion token", type: "text" },
    },
    async authorize(rawCredentials) {
      const parsed = credentialSchema.safeParse(rawCredentials);
      if (!parsed.success) return null;
      if (parsed.data.completionToken) {
        const user = await consumeSessionBootstrapToken(
          hashToken(parsed.data.completionToken),
        );
        if (!user) return null;
        await recordLoginSuccess(user.id);
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      }
      const email = normalizeEmail(parsed.data.email!);
      const credential = await getCredentialUser(email);
      const validPassword = await verifyPassword(
        credential?.passwordHash ?? (await dummyPasswordHash),
        parsed.data.password!,
      );
      if (
        !credential ||
        !validPassword ||
        credential.user.status !== "active" ||
        !credential.user.emailVerified ||
        (credential.lockedUntil && credential.lockedUntil > new Date())
      ) {
        if (credential) await recordLoginFailure(credential.user.id);
        return null;
      }
      await recordLoginSuccess(credential.user.id);
      return {
        id: credential.user.id,
        name: credential.user.name,
        email: credential.user.email,
        image: credential.user.image,
      };
    },
  }),
];

if (googleClientId && googleClientSecret) {
  providers.push(
    Google({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      authorization: { params: { scope: "openid email profile" } },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: cohorioAuthAdapter,
  providers,
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60,
  },
  pages: {
    signIn: "/sign-in",
    error: "/sign-in",
  },
  trustHost: true,
  cookies: authCookies,
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") return true;
      const emailVerified =
        !profile ||
        !("email_verified" in profile) ||
        Boolean(profile.email_verified);
      if (!user.email || !emailVerified) return "/sign-in?error=Verification";
      const existing = await getUserByEmail(user.email);
      const linkedGoogle = account.providerAccountId
        ? await getUserByAccount("google", account.providerAccountId)
        : null;
      if (
        existing &&
        !linkedGoogle &&
        (await getCredentialUser(user.email))
      ) {
        return "/sign-in?error=OAuthAccountNotLinked";
      }
      const candidate = user.id ? await getUserById(user.id) : existing;
      if (
        candidate?.status === "suspended" ||
        candidate?.status === "deleted" ||
        existing?.status === "suspended" ||
        existing?.status === "deleted"
      ) {
        return "/sign-in?error=AccessDenied";
      }
      const userId = candidate?.id ?? existing?.id ?? user.id;
      if (!userId) return "/sign-in?error=Configuration";
      const activated = await activateOAuthUser(userId);
      if (!activated) return "/sign-in?error=AccessDenied";
      await recordLoginSuccess(userId);
      return true;
    },
    async jwt({ token, user }) {
      const userId = user?.id ?? token.sub;
      if (!userId) return token;
      const stored = await getUserById(userId);
      if (!stored || stored.status !== "active") return null;
      if (
        !user?.id &&
        Number(token.sessionVersion ?? 0) !== stored.sessionVersion
      ) {
        return null;
      }
      token.sub = stored.id;
      token.sessionVersion = stored.sessionVersion;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.sessionVersion = Number(token.sessionVersion ?? 0);
      }
      return session;
    },
  },
});
