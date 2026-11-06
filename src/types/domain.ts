export type AccountType = "ANONYMOUS" | "REGISTERED";

export type UserRole = "USER" | "MODERATOR" | "ADMIN";

export type LetterVisibility = "PRIVATE" | "PUBLIC";

export type EntryType = "LETTER" | "NOTE" | "RESPONSE";

export type ReportStatus = "PENDING" | "REVIEWED" | "DISMISSED" | "REMOVED";

export type ModerationAction = "APPROVE" | "REJECT" | "REMOVE" | "DISMISS_REPORTS";

export type ModerationStatus = "UNMODERATED" | "HELD" | "APPROVED" | "REJECTED" | "REMOVED";

export type ReportReason =
  | "PERSONAL_INFO"
  | "HARASSMENT"
  | "THREATS"
  | "SPAM"
  | "OTHER";

export interface AuthenticatedUser {
  id: string;
  unsentId: string;
  accountType: AccountType;
  role: UserRole;
  phone?: string | null;
  phoneVerifiedAt?: Date | null;
  createdAt: Date;
}

export interface ModerationQueueItem {
  id: string;
  title?: string | null;
  recipientName?: string | null;
  content: string;
  theme?: string | null;
  visibility: LetterVisibility;
  entryType: EntryType;
  isModerated: boolean;
  moderationReason?: string | null;
  moderationStatus?: string | null;
  createdAt: Date;
  reportsCount: number;
  reports: {
    id: string;
    reason: string;
    details?: string | null;
    status: string;
    createdAt: Date;
  }[];
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

export interface LetterResponseItem {
  id: string;
  parentLetterId: string;
  content: string;
  createdAt: Date;
}

export interface NotificationItem {
  id: string;
  type: string;
  letterId?: string | null;
  payload?: {
    responseId?: string;
    preview?: string;
    recipientName?: string | null;
    letterTitle?: string | null;
    createdAt?: string;
  } | null;
  isRead: boolean;
  createdAt: Date;
}

export interface SessionContext {
  user: AuthenticatedUser;
  token: string;
  expiresAt: Date;
}

export interface ArchiveLetterItem {
  id: string;
  title?: string | null;
  recipientName?: string | null;
  content: string;
  theme?: string | null;
  visibility: LetterVisibility;
  entryType: EntryType;
  isModerated: boolean;
  moderationReason?: string | null;
  moderationStatus?: string | null;
  tags: string[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ArchiveResponseItem {
  id: string;
  content: string;
  parentLetterId: string;
  isModerated: boolean;
  moderationStatus?: string | null;
  moderationReason?: string | null;
  createdAt: Date | string;
  parentLetter?: {
    id: string;
    title?: string | null;
    recipientName?: string | null;
    visibility: LetterVisibility;
    isModerated: boolean;
  } | null;
}

export interface ArchiveSavedLetterItem {
  id: string; // SavedLetter ID
  letterId: string;
  privateNote?: string | null;
  savedAt: Date | string;
  updatedAt: Date | string;
  letter: {
    id: string;
    title?: string | null;
    recipientName?: string | null;
    content: string;
    theme?: string | null;
    createdAt: Date | string;
    isOrbitAccessible: boolean;
  };
}

export interface ArchiveNoteItem {
  id: string;
  title?: string | null;
  content: string;
  tags: string[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ArchiveData {
  identity: {
    unsentId: string;
    accountType: AccountType;
    createdAt: Date | string;
  };
  letters: ArchiveLetterItem[];
  responses: ArchiveResponseItem[];
  savedLetters: ArchiveSavedLetterItem[];
  notes: ArchiveNoteItem[];
  counts: {
    letters: number;
    responses: number;
    savedLetters: number;
    notes: number;
  };
}

export interface ArchiveExportData {
  exportedAt: string;
  identity: {
    unsentId: string;
    accountType: AccountType;
    memberSince: string;
  };
  myLetters: {
    id: string;
    title?: string | null;
    recipient?: string | null;
    content: string;
    theme?: string | null;
    tags: string[];
    visibility: LetterVisibility;
    status: string;
    createdAt: string;
    updatedAt: string;
  }[];
  myResponses: {
    id: string;
    parentLetterId: string;
    parentLetterTitle?: string | null;
    parentLetterRecipient?: string | null;
    content: string;
    status: string;
    createdAt: string;
  }[];
  myPersonalNotes: {
    id: string;
    title?: string | null;
    content: string;
    tags: string[];
    createdAt: string;
    updatedAt: string;
  }[];
  savedLetters: {
    savedAt: string;
    privateReflectionNote?: string | null;
    originalLetter: {
      id: string;
      title?: string | null;
      recipient?: string | null;
      content: string;
      theme?: string | null;
      publishedAt: string;
    };
  }[];
}
