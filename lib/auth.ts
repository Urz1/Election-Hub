import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials) {
        const email = credentials.email as string;
        const password = credentials.password as string;

        if (!email || !password) return null;

        const organizer = await prisma.organizer.findUnique({
          where: { email },
        });

        if (!organizer || !organizer.passwordHash) return null;

        const valid = await bcrypt.compare(password, organizer.passwordHash);
        if (!valid) return null;

        return {
          id: organizer.id,
          name: organizer.name,
          email: organizer.email,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        const email = user.email;
        if (!email) return false;

        let organizer = await prisma.organizer.findUnique({
          where: { email },
        });

        if (!organizer) {
          organizer = await prisma.organizer.create({
            data: {
              name: user.name || email.split("@")[0],
              email,
              emailVerified: true,
            },
          });
        } else if (!organizer.emailVerified) {
          await prisma.organizer.update({
            where: { id: organizer.id },
            data: { emailVerified: true },
          });
        }

        const existingAccount = await prisma.account.findUnique({
          where: {
            provider_providerAccountId: {
              provider: "google",
              providerAccountId: account.providerAccountId,
            },
          },
        });

        if (!existingAccount) {
          await prisma.account.create({
            data: {
              organizerId: organizer.id,
              provider: "google",
              providerAccountId: account.providerAccountId,
            },
          });
        }

        user.id = organizer.id;
      }

      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
