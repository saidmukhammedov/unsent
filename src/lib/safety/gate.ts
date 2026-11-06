export type SafetyAction = "ALLOW" | "HOLD" | "BLOCK";

export interface SafetyEvaluation {
  action: SafetyAction;
  passed: boolean;
  reason?: string;
  detectedFlags: string[];
}

// -----------------------------------------------------------------------------
// Prohibited Content Patterns (Severe threats, violence, doxxing, spam)
// -----------------------------------------------------------------------------

const PROHIBITED_THREAT_PATTERNS = [
  /\b(i\s*will|i\s*am\s*going\s*to|i'm\s*going\s*to|im\s*going\s*to|gonna)\s+(kill|murder|shoot|stab|slit\s+your\s+throat|strangle|hurt|destroy)\s+you\b/i,
  /\b(kill|murder|shoot|strangle|hurt)\s+you\b/i,
  /\b(bomb|shoot\s+up|burn\s+down)\s+(your|the|a)\s+(house|school|office|building)\b/i,
  /\bkill\s+yourself\b/i,
  /\byou\s+should\s+die\b/i,
];

const DOXXING_PATTERNS = [
  /\b(their|his|her|my\s+ex's)\s+(ssn|social\s+security|credit\s+card|real\s+address|home\s+address)\s+is\b/i,
  /\blives\s+at\s+\d{1,5}\s+[A-Za-z0-9\s]+(?:street|st|avenue|ave|road|rd|blvd)\b/i,
];

const SPAM_PATTERNS = [
  /\b(free\s+crypto|casino\s+bonus|earn\s+\$?\d{3,}\s+daily|whatsapp\s+signals|telegram\s+signals)\b/i,
  /\b(buy\s+viagra|cheap\s+cialis)\b/i,
];

// -----------------------------------------------------------------------------
// PII Patterns (Phone, Email, Physical Address, Socials, Links)
// -----------------------------------------------------------------------------

const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+(?:\s*@\s*|\s*\[at\]\s*|\s*\(at\)\s*)[A-Za-z0-9.-]+\s*(?:\.\s*|\[dot\]\s*|\(dot\)\s*)[A-Za-z]{2,}\b/i;

// Match standard and varied phone numbers: +1 (555) 123-4567, 555-123-4567, 555.123.4567, 10-12 consecutive digits
const PHONE_PATTERNS = [
  /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/,
  /\b\+?[1-9]\d{1,4}[-.\s]?\d{2,4}[-.\s]?\d{2,4}[-.\s]?\d{2,4}\b/,
  /\b(?:call|text|reach|whatsapp|phone)\s*(?:me)?\s*(?:at|on)?\s*[:\s]*\+?\d[\d\s.-]{7,15}\d\b/i,
];

const URL_SOCIAL_PATTERNS = [
  /\bhttps?:\/\/[^\s]+/i,
  /\b(?:t\.me|wa\.me|instagram\.com|twitter\.com|x\.com|tiktok\.com|snapchat\.com|discord\.gg)\/[^\s]+/i,
  /\b(?:my\s+(?:insta|snap|telegram|number|ig|handle)\s+is)\s+@?[a-zA-Z0-9._-]+/i,
];

export const SAFETY_FLAGS = {
  VIOLENCE_OR_THREAT: "VIOLENCE_OR_THREAT",
  DOXXING_ATTEMPT: "DOXXING_ATTEMPT",
  PROHIBITED_SPAM: "PROHIBITED_SPAM",
  PII_EMAIL: "PII_EMAIL",
  PII_PHONE: "PII_PHONE",
  PII_LINK_OR_HANDLE: "PII_LINK_OR_HANDLE",
  PII_STREET_ADDRESS: "PII_STREET_ADDRESS",
  PII_SENSITIVE_NUMBER: "PII_SENSITIVE_NUMBER",
} as const;

export type SafetyFlag = (typeof SAFETY_FLAGS)[keyof typeof SAFETY_FLAGS];

const ADDRESS_PATTERNS = [
  /\b\d{1,5}\s+[A-Za-z0-9.\s]+(?:Street|St\.|St|Avenue|Ave\.|Ave|Boulevard|Blvd\.|Blvd|Road|Rd\.|Rd|Drive|Dr\.|Dr|Lane|Ln\.|Ln|Court|Ct\.|Ct|Way|Terrace|Ter\.|Ter|Place|Pl\.|Pl)\b/i,
  /\b(?:Apt|Apartment|Suite|Ste|Unit)\s*#?\s*\d+[A-Za-z]?\b/i,
];

const SSN_CREDITCARD_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/, // SSN
  /\b(?:\d{4}[-\s]?){3}\d{4}\b/, // Credit Card
];

/**
 * Server-side evaluation of public letter submissions.
 * Classifies content as ALLOW, HOLD (held for review due to PII/flags), or BLOCK (prohibited).
 */
export function evaluateSafety(
  content: string,
  recipientName?: string | null,
  title?: string | null
): SafetyEvaluation {
  const fullText = [title || "", recipientName || "", content].join(" ").trim();
  const detectedFlags: string[] = [];

  // 1. Check for explicit Prohibited Content (BLOCK)
  for (const pattern of PROHIBITED_THREAT_PATTERNS) {
    if (pattern.test(fullText)) {
      detectedFlags.push("VIOLENCE_OR_THREAT");
      return {
        action: "BLOCK",
        passed: false,
        reason: "Content violates safety guidelines regarding threats or violence.",
        detectedFlags,
      };
    }
  }

  for (const pattern of DOXXING_PATTERNS) {
    if (pattern.test(fullText)) {
      detectedFlags.push("DOXXING_ATTEMPT");
      return {
        action: "BLOCK",
        passed: false,
        reason: "Content appears to contain targeted private addresses or doxxing details.",
        detectedFlags,
      };
    }
  }

  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(fullText)) {
      detectedFlags.push("PROHIBITED_SPAM");
      return {
        action: "BLOCK",
        passed: false,
        reason: "Content appears to be promotional spam or commercial solicitation.",
        detectedFlags,
      };
    }
  }

  // 2. Check for PII and identifying info (HOLD for review)
  if (EMAIL_PATTERN.test(fullText)) {
    detectedFlags.push("PII_EMAIL");
  }

  for (const pattern of PHONE_PATTERNS) {
    if (pattern.test(fullText)) {
      detectedFlags.push("PII_PHONE");
      break;
    }
  }

  for (const pattern of URL_SOCIAL_PATTERNS) {
    if (pattern.test(fullText)) {
      detectedFlags.push("PII_LINK_OR_HANDLE");
      break;
    }
  }

  for (const pattern of ADDRESS_PATTERNS) {
    if (pattern.test(fullText)) {
      detectedFlags.push("PII_STREET_ADDRESS");
      break;
    }
  }

  for (const pattern of SSN_CREDITCARD_PATTERNS) {
    if (pattern.test(fullText)) {
      detectedFlags.push("PII_SENSITIVE_NUMBER");
      break;
    }
  }

  if (detectedFlags.length > 0) {
    return {
      action: "HOLD",
      passed: false,
      reason: `Flagged for potential identifying details (${detectedFlags.join(", ")}).`,
      detectedFlags,
    };
  }

  // 3. Passed all safety checks (ALLOW)
  return {
    action: "ALLOW",
    passed: true,
    detectedFlags: [],
  };
}
