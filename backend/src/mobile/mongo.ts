import mongoose from "mongoose";
import { Decimal } from "decimal.js";
import { account, grossNotional } from "@investing-hub/shared/portfolio";
import {
  savedPortfolioSchema,
  settingsSchema,
  type SavedPortfolio,
  type Settings,
} from "@investing-hub/shared/mobile";
import type { Account, MobileRepository } from "./repository.js";
import { AppError } from "../errors.js";

interface UserRow {
  _id: mongoose.Types.ObjectId;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  isVerified: boolean;
  fcmToken?: string;
}
interface TradeRow {
  _id: mongoose.Types.ObjectId;
  symbol: string;
  action: "buy" | "sell";
  quantity: string | number;
  price: string | number;
  fee?: string;
  date: Date;
}
interface PortfolioRow {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  name: string;
  avatar?: string;
  transactions: TradeRow[];
  __v?: number;
}
interface SettingsRow {
  userId: mongoose.Types.ObjectId;
  theme?: "light" | "dark";
  selectedCoins?: string[];
  priceAlerts?:
    | Map<string, { min: number; max: number }>
    | Record<string, { min: number; max: number }>;
  alertThreshold?: number;
}
const unavailable = () =>
  new AppError(
    503,
    "ACCOUNTS_UNAVAILABLE",
    "Account storage is unavailable. Public market data remains available.",
  );
const userView = (row: UserRow): Account => ({
  id: String(row._id),
  firstName: row.firstName,
  lastName: row.lastName,
  email: row.email,
  password: row.password,
  isVerified: row.isVerified,
});

// Existing collection names and legacy field names are preserved. New decimal values
// are strings; historical numeric BSON values are read without rewriting documents.
export function decodePortfolio(row: PortfolioRow): SavedPortfolio {
  try {
    const parsed = savedPortfolioSchema.safeParse({
      _id: String(row._id),
      name: row.name,
      avatar: row.avatar,
      revision: row.__v ?? 0,
      transactions: row.transactions.map((t) => ({
        id: String(t._id),
        symbol: t.symbol.endsWith("USDT") ? t.symbol : `${t.symbol}USDT`,
        side: t.action,
        quantity: new Decimal(t.quantity).toFixed(),
        price: new Decimal(t.price).toFixed(),
        fee: t.fee ?? "0",
        timestamp: new Date(t.date).toISOString(),
      })),
    });
    if (!parsed.success) throw new Error("Invalid stored ledger");
    account(parsed.data.transactions);
    return parsed.data;
  } catch {
    throw new AppError(
      409,
      "LEGACY_LEDGER_REVIEW",
      "Historical portfolio contains invalid trades, unsupported symbols or precision. Data is preserved; operator review is required before editing.",
    );
  }
}
export function decodeSettings(row: SettingsRow | null): Settings {
  const alerts =
    row?.priceAlerts instanceof Map
      ? Object.fromEntries(row.priceAlerts)
      : (row?.priceAlerts ?? {});
  // Old open-ended alerts used Infinity; preserve storage but never deliver invalid ranges.
  const validAlerts = Object.fromEntries(
    Object.entries(alerts).filter(
      ([, a]) =>
        Number.isFinite(a.min) &&
        Number.isFinite(a.max) &&
        a.min >= 0 &&
        a.min < a.max,
    ),
  );
  return settingsSchema.parse({
    theme: row?.theme,
    selectedCoins: row?.selectedCoins,
    priceAlerts: validAlerts,
    alertThreshold: row?.alertThreshold,
  });
}
export function createMongoRepository(uri: string): MobileRepository {
  const connection = mongoose.createConnection();
  const options = { bufferCommands: false, autoIndex: false };
  const users = connection.model(
    "User",
    new mongoose.Schema<UserRow>(
      {
        firstName: String,
        lastName: String,
        email: { type: String, unique: true },
        password: String,
        isVerified: Boolean,
        fcmToken: String,
      },
      { ...options, timestamps: true },
    ),
    "users",
  );
  const trade = new mongoose.Schema({
    symbol: String,
    action: String,
    quantity: mongoose.Schema.Types.Mixed,
    price: mongoose.Schema.Types.Mixed,
    total: mongoose.Schema.Types.Mixed,
    fee: String,
    date: Date,
  });
  const portfolios = connection.model(
    "Portfolio",
    new mongoose.Schema<PortfolioRow>(
      {
        userId: mongoose.Schema.Types.ObjectId,
        name: String,
        avatar: String,
        transactions: [trade],
      },
      options,
    ),
    "portfolios",
  );
  const settings = connection.model(
    "Settings",
    new mongoose.Schema<SettingsRow>(
      {
        userId: mongoose.Schema.Types.ObjectId,
        theme: String,
        selectedCoins: [String],
        priceAlerts: {
          type: Map,
          of: new mongoose.Schema({ min: Number, max: Number }, { _id: false }),
        },
        alertThreshold: Number,
      },
      { ...options, timestamps: true },
    ),
    "settings",
  );
  // No blocking startup or process exit: public routes survive disabled/unavailable Mongo.
  // A bounded retry also recovers from an initial outage without restarting the API.
  let closing = false;
  let initialized = false;
  let reconnect: ReturnType<typeof setTimeout> | undefined;
  async function connect() {
    try {
      await connection.openUri(uri, {
        serverSelectionTimeoutMS: 3000,
        connectTimeoutMS: 3000,
        maxPoolSize: 5,
        waitQueueTimeoutMS: 3000,
        socketTimeoutMS: 5000,
      });
      // Non-destructive: preserve existing indexes/data; create the legacy unique
      // email index on fresh databases too. Fail private readiness on an index conflict.
      await users.createIndexes();
      await portfolios.collection.createIndex({ userId: 1 });
      await settings.collection.createIndex({ userId: 1 });
      initialized = true;
    } catch {
      if (!closing)
        reconnect = setTimeout(() => {
          void connect();
        }, 30000).unref();
    }
  }
  void connect();
  connection.on("error", () => {
    /* No connection strings or driver payloads in logs. */
  });
  function ready() {
    if (!initialized || connection.readyState !== 1) throw unavailable();
  }
  const objectId = (id: string) => new mongoose.Types.ObjectId(id);
  async function readSettings(owner: string) {
    ready();
    return decodeSettings(
      await settings
        .findOne({ userId: objectId(owner) })
        .lean<SettingsRow>()
        .maxTimeMS(3000),
    );
  }
  return {
    available: () => initialized && connection.readyState === 1,
    async findUser(email) {
      ready();
      const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const row = await users
        .findOne({ email: { $regex: `^${escaped}$`, $options: "i" } })
        .lean<UserRow>()
        .maxTimeMS(3000);
      return row ? userView(row) : null;
    },
    async user(id) {
      ready();
      const row = await users.findById(id).lean<UserRow>().maxTimeMS(3000);
      return row ? userView(row) : null;
    },
    async createUser(user) {
      ready();
      return userView((await users.create(user)).toObject() as UserRow);
    },
    async portfolios(owner) {
      ready();
      return (
        await portfolios
          .find({ userId: objectId(owner) })
          .lean<PortfolioRow[]>()
          .maxTimeMS(3000)
      ).map(decodePortfolio);
    },
    async portfolio(owner, id) {
      ready();
      const row = await portfolios
        .findOne({ _id: id, userId: objectId(owner) })
        .lean<PortfolioRow>()
        .maxTimeMS(3000);
      return row ? decodePortfolio(row) : null;
    },
    async createPortfolio(owner, metadata) {
      ready();
      return decodePortfolio(
        (
          await portfolios.create({
            ...metadata,
            userId: objectId(owner),
            transactions: [],
          })
        ).toObject() as PortfolioRow,
      );
    },
    async savePortfolio(owner, p) {
      ready();
      const transactions = p.transactions.map((t) => ({
        _id: objectId(t.id),
        symbol: t.symbol.replace(/USDT$/, ""),
        action: t.side,
        quantity: t.quantity,
        price: t.price,
        fee: t.fee,
        total: grossNotional(t.quantity, t.price),
        date: new Date(t.timestamp),
      }));
      const revision =
        p.revision === 0
          ? { $or: [{ __v: 0 }, { __v: { $exists: false } }] }
          : { __v: p.revision };
      const updated = await portfolios
        .findOneAndUpdate(
          { _id: p._id, userId: objectId(owner), ...revision },
          {
            $set: { name: p.name, avatar: p.avatar, transactions },
            $inc: { __v: 1 },
          },
          { new: true },
        )
        .lean<PortfolioRow>()
        .maxTimeMS(3000);
      if (!updated)
        throw new AppError(
          409,
          "PORTFOLIO_CONFLICT",
          "Portfolio changed. Reload it before retrying.",
        );
      return decodePortfolio(updated);
    },
    async deletePortfolio(owner, id) {
      ready();
      return (
        (
          await portfolios
            .deleteOne({ _id: id, userId: objectId(owner) })
            .maxTimeMS(3000)
        ).deletedCount === 1
      );
    },
    settings: readSettings,
    async saveSettings(owner, patch) {
      ready();
      const row = await settings
        .findOneAndUpdate(
          { userId: objectId(owner) },
          { $set: patch },
          { upsert: true, new: true, setDefaultsOnInsert: false },
        )
        .lean<SettingsRow>()
        .maxTimeMS(3000);
      return decodeSettings(row);
    },
    async pushToken(owner, token) {
      ready();
      await users
        .updateOne({ _id: owner }, { $set: { fcmToken: token } })
        .maxTimeMS(3000);
    },
    async alertRecipients(after, limit) {
      ready();
      const rows = await users
        .find({
          fcmToken: { $type: "string", $ne: "" },
          ...(after ? { _id: { $gt: objectId(after) } } : {}),
        })
        .sort({ _id: 1 })
        .limit(limit)
        .lean<UserRow[]>()
        .maxTimeMS(3000);
      return Promise.all(
        rows.map(async (row) => ({
          id: String(row._id),
          token: row.fcmToken!,
          settings: await readSettings(String(row._id)),
        })),
      );
    },
    async claimAlert(owner, symbol, alert) {
      ready();
      return (
        (
          await settings
            .updateOne(
              {
                userId: objectId(owner),
                [`priceAlerts.${symbol}.min`]: alert.min,
                [`priceAlerts.${symbol}.max`]: alert.max,
              },
              { $unset: { [`priceAlerts.${symbol}`]: "" } },
            )
            .maxTimeMS(3000)
        ).modifiedCount === 1
      );
    },
    async restoreAlert(owner, symbol, alert) {
      ready();
      await settings
        .updateOne(
          {
            userId: objectId(owner),
            [`priceAlerts.${symbol}`]: { $exists: false },
          },
          { $set: { [`priceAlerts.${symbol}`]: alert } },
        )
        .maxTimeMS(3000);
    },
    async close() {
      closing = true;
      if (reconnect) clearTimeout(reconnect);
      await connection.close();
    },
  };
}
