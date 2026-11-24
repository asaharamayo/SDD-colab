import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    hostLogin?: string;
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      login: string;
      isHost: boolean;
      /** Role chosen at login — who this person is, for routing notifications. Not a view filter. */
      role?: "product" | "engineering" | "quality" | null;
    };
  }

  interface User {
    login?: string;
    isGuest?: boolean;
    role?: "product" | "engineering" | "quality" | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    login?: string;
    isHost?: boolean;
    role?: "product" | "engineering" | "quality" | null;
  }
}
