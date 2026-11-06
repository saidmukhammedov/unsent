export const REPORT_REASONS = [
  { id: "PERSONAL_INFO", label: "Personal information exposed" },
  { id: "HARASSMENT", label: "Harassment or abuse" },
  { id: "THREATS", label: "Threats or intimidation" },
  { id: "SPAM", label: "Spam or advertising" },
  { id: "OTHER", label: "Other" },
] as const;

export type ReportReasonKey = (typeof REPORT_REASONS)[number]["id"];

export const VALID_REPORT_REASON_KEYS = REPORT_REASONS.map((r) => r.id);

export function getReasonLabel(reasonKey: string): string {
  const match = REPORT_REASONS.find((r) => r.id === reasonKey);
  return match ? match.label : reasonKey;
}
