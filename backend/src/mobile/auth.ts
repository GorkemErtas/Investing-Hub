import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { z } from "zod";
import {
  idSchema,
  type User,
  type registerSchema,
} from "@investing-hub/shared/mobile";
import type { Account, MobileRepository } from "./repository.js";
import { AppError } from "../errors.js";

export type VerificationMailer = (email: string, code: string) => Promise<void>;
export const publicUser = (user: Account): User => ({
  id: user.id,
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
});
const invalidLogin = () =>
  new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
const digest = (value: string) => createHash("sha256").update(value).digest();

export function createAuthService(
  repo: MobileRepository,
  secret: string,
  mailer?: VerificationMailer,
  now = Date.now,
) {
  if (Buffer.byteLength(secret) < 32)
    throw new Error("Strong JWT secret required.");
  const pending = new Map<
    string,
    {
      user: Omit<Account, "id">;
      code: Buffer;
      expires: number;
      attempts: number;
    }
  >();
  // Fixed cost even for unknown accounts, reducing account-enumeration timing differences.
  const dummy = bcrypt.hash("unused-comparison-password", 12);
  return {
    registrationEnabled: Boolean(mailer),
    async register(input: z.infer<typeof registerSchema>) {
      if (!mailer)
        throw new AppError(
          503,
          "REGISTRATION_DISABLED",
          "Email registration is unavailable. Contact the operator.",
        );
      if (Buffer.byteLength(input.password, "utf8") > 72)
        throw new AppError(
          400,
          "INVALID_PASSWORD",
          "Password must use at most 72 UTF-8 bytes.",
        );
      for (const [key, entry] of pending)
        if (entry.expires <= now()) pending.delete(key);
      if (pending.size >= 1000)
        throw new AppError(
          503,
          "REGISTRATION_BUSY",
          "Registration is busy. Please retry later.",
        );
      if (await repo.findUser(input.email)) return;
      const previous = pending.get(input.email);
      if (previous && previous.expires - now() > 9 * 60000)
        throw new AppError(
          429,
          "VERIFICATION_COOLDOWN",
          "Please wait a minute before requesting another code.",
        );
      const code = String(randomInt(100000, 1000000));
      const user = {
        ...input,
        password: await bcrypt.hash(input.password, 12),
        isVerified: true,
      };
      pending.set(input.email, {
        user,
        code: digest(code),
        expires: now() + 10 * 60000,
        attempts: 0,
      });
      try {
        await mailer(input.email, code);
      } catch {
        pending.delete(input.email);
        throw new AppError(
          503,
          "EMAIL_UNAVAILABLE",
          "Could not send verification email. Please retry later.",
        );
      }
    },
    async verify(email: string, code: string) {
      const entry = pending.get(email);
      if (!entry || entry.expires <= now() || entry.attempts >= 5) {
        pending.delete(email);
        throw new AppError(
          400,
          "INVALID_VERIFICATION",
          "Verification code is invalid or expired.",
        );
      }
      entry.attempts++;
      if (!timingSafeEqual(entry.code, digest(code)))
        throw new AppError(
          400,
          "INVALID_VERIFICATION",
          "Verification code is invalid or expired.",
        );
      // Consume before awaiting persistence, so concurrent verification cannot reuse a code.
      pending.delete(email);
      if (!(await repo.findUser(email))) await repo.createUser(entry.user);
    },
    async login(email: string, password: string) {
      if (Buffer.byteLength(password, "utf8") > 72) throw invalidLogin();
      const user = await repo.findUser(email);
      const matches = await bcrypt.compare(
        password,
        user?.password ?? (await dummy),
      );
      if (!user || !matches || !user.isVerified) throw invalidLogin();
      const token = jwt.sign({}, secret, {
        algorithm: "HS256",
        subject: user.id,
        issuer: "investing-hub",
        audience: "investing-hub-mobile",
        expiresIn: "1h",
      });
      const payload = jwt.decode(token) as jwt.JwtPayload;
      return {
        token,
        user: publicUser(user),
        expiresAt: new Date(payload.exp! * 1000).toISOString(),
      };
    },
    authenticate(header: string | undefined) {
      if (!header?.startsWith("Bearer "))
        throw new AppError(401, "UNAUTHENTICATED", "Please log in.");
      try {
        const payload = jwt.verify(header.slice(7), secret, {
          algorithms: ["HS256"],
          issuer: "investing-hub",
          audience: "investing-hub-mobile",
        });
        if (typeof payload === "string" || !payload.exp)
          throw new Error("Invalid token");
        return idSchema.parse(payload.sub);
      } catch {
        throw new AppError(
          401,
          "SESSION_EXPIRED",
          "Session expired. Please log in again.",
        );
      }
    },
  };
}
export type AuthService = ReturnType<typeof createAuthService>;
