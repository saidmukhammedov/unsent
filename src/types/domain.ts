export type AccountType = "ANONYMOUS" | "REGISTERED";

export type LetterVisibility = "PRIVATE" | "PUBLIC";

export type EntryType = "LETTER" | "NOTE";

export type ReportStatus = "PENDING" | "REVIEWED" | "DISMISSED" | "REMOVED";

export interface AuthenticatedUser {
  id: string;
  unsentId: string;
  accountType: AccountType;
  phone?: string | null;
  phoneVerifiedAt?: Date | null;
  createdAt: Date;
}

export interface LetterSummary {
  id: string;
  title?: string | null;
  recipientName?: string | null;
  content: string;
  theme?: string | null;
  entryType: EntryType;
  visibility: LetterVisibility;
  tags: string[];
  isSaved?: boolean;
  parentLetterId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicLetterItem {
  id: string;
  title?: string | null;
  recipientName?: string | null;
  content: string;
  theme?: string | null;
  createdAt: Date;
  isSaved?: boolean;
}

export interface SessionContext {
  user: AuthenticatedUser;
  token: string;
  expiresAt: Date;
}
