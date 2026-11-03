import type {
  SavedPortfolio,
  Settings,
  User,
} from "@investing-hub/shared/mobile";

export interface Account extends User {
  password: string;
  isVerified: boolean;
}
export interface AlertRecipient {
  id: string;
  token: string;
  settings: Settings;
}
export interface MobileRepository {
  available(): boolean;
  findUser(email: string): Promise<Account | null>;
  user(id: string): Promise<Account | null>;
  createUser(user: Omit<Account, "id">): Promise<Account>;
  portfolios(owner: string): Promise<SavedPortfolio[]>;
  portfolio(owner: string, id: string): Promise<SavedPortfolio | null>;
  createPortfolio(
    owner: string,
    metadata: { name: string; avatar?: string },
  ): Promise<SavedPortfolio>;
  savePortfolio(
    owner: string,
    portfolio: SavedPortfolio,
  ): Promise<SavedPortfolio>;
  deletePortfolio(owner: string, id: string): Promise<boolean>;
  settings(owner: string): Promise<Settings>;
  saveSettings(owner: string, patch: Partial<Settings>): Promise<Settings>;
  pushToken(owner: string, token: string): Promise<void>;
  alertRecipients(
    after: string | null,
    limit: number,
  ): Promise<AlertRecipient[]>;
  claimAlert(
    owner: string,
    symbol: string,
    alert: { min: number; max: number },
  ): Promise<boolean>;
  restoreAlert(
    owner: string,
    symbol: string,
    alert: { min: number; max: number },
  ): Promise<void>;
  close(): Promise<void>;
}
