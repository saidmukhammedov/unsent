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
  entryType: EntryType;
  visibility: LetterVisibility;
  isAnonymous: boolean;
  authorUnsentId?: string | null;
  tags: string[];
  resonanceCount: number;
  parentLetterId?: string | null;
  createdAt: Date;
}

export interface SessionContext {
  user: AuthenticatedUser;
  token: string;
  expiresAt: Date;
}
