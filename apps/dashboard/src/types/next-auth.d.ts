import "next-auth";
import "@auth/core/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      sessionVersion: number;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    sessionVersion?: number;
  }
}
