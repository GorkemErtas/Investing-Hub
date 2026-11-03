import { z } from "zod";
import { transactionSchema } from "./portfolio.js";

export const idSchema = z.string().regex(/^[a-f\d]{24}$/i);
export const emailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((s) => s.toLowerCase());
const name = z.string().trim().min(1).max(60);
// bcrypt's input limit is 72 UTF-8 bytes; the service checks bytes as well.
export const registerSchema = z.strictObject({
  firstName: name,
  lastName: name,
  email: emailSchema,
  password: z.string().min(12).max(72),
});
export const loginSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(1).max(72),
});
export const verifySchema = z.strictObject({
  email: emailSchema,
  verificationCode: z.string().regex(/^\d{6}$/),
});
export const userSchema = z.object({
  id: idSchema,
  firstName: name,
  lastName: name,
  email: z.string().email(),
});
export type User = z.infer<typeof userSchema>;
export const loginResponseSchema = z.object({
  token: z.string().min(1),
  user: userSchema,
  expiresAt: z.string().datetime(),
});
export const portfolioMetadataSchema = z.strictObject({
  name,
  avatar: z.enum(["boy", "girl"]).optional(),
});
export const savedPortfolioSchema = z.object({
  _id: idSchema,
  name,
  avatar: z.string().optional(),
  transactions: z.array(transactionSchema).max(5000),
  revision: z.number().int().nonnegative(),
});
export type SavedPortfolio = z.infer<typeof savedPortfolioSchema>;
export const tradeSchema = transactionSchema.omit({ id: true }).strict();
export const baseSymbolSchema = z.string().regex(/^[A-Z0-9]{2,15}$/);
export const priceAlertSchema = z
  .object({
    min: z.number().finite().nonnegative(),
    max: z.number().finite().positive(),
  })
  .refine((a) => a.min < a.max, "Minimum must be below maximum.");
// Historical favorites may include assets outside the current public registry.
// Retain those values; clients explicitly show that their prices are unsupported.
export const settingsSchema = z.object({
  theme: z.enum(["light", "dark"]).default("light"),
  selectedCoins: z.array(baseSymbolSchema).max(100).default([]),
  priceAlerts: z.record(baseSymbolSchema, priceAlertSchema).default({}),
  alertThreshold: z.number().int().min(1).max(100).default(10),
});
export type Settings = z.infer<typeof settingsSchema>;
// Defaults belong to full records, never PATCH: omitted fields must stay untouched.
export const settingsPatchSchema = z.strictObject({
  theme: settingsSchema.shape.theme.removeDefault().optional(),
  selectedCoins: settingsSchema.shape.selectedCoins.removeDefault().optional(),
  priceAlerts: settingsSchema.shape.priceAlerts.removeDefault().optional(),
  alertThreshold: settingsSchema.shape.alertThreshold
    .removeDefault()
    .optional(),
});
export const pushTokenSchema = z.strictObject({
  token: z.string().min(20).max(4096).regex(/^\S+$/),
});
export const messageSchema = z.object({ message: z.string() });
export const capabilitiesSchema = z.object({
  accounts: z.boolean(),
  registration: z.boolean(),
  notifications: z.boolean(),
});
