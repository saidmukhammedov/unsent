import crypto from "crypto";

const ADJECTIVES = [
  "pale", "amber", "quiet", "distant", "silent", "gentle", "hollow",
  "lingering", "fading", "hidden", "solitary", "tender", "patient",
  "wistful", "restless", "shadowed", "fragile", "golden", "wandering",
  "veiled", "unspoken", "weathered", "nocturnal", "secret", "autumnal",
  "calm", "forgotten", "still", "silver", "dusky", "poetic", "boundless"
];

const NOUNS = [
  "starlight", "echo", "horizon", "wave", "lantern", "whisper",
  "shadow", "sparrow", "memory", "passage", "ember", "tide",
  "solace", "reflection", "silhouette", "breeze", "reverie", "harbor",
  "footstep", "sanctuary", "branch", "current", "compass", "voyage",
  "glance", "notebook", "station", "candle", "willow", "silence"
];

/**
 * Generates an evocative, human-readable UNSENT identity handle.
 * Example: @amber-whisper-482
 */
export function generateUnsentId(): string {
  const adjIndex = crypto.randomInt(0, ADJECTIVES.length);
  const nounIndex = crypto.randomInt(0, NOUNS.length);
  const randomSuffix = crypto.randomInt(100, 999);

  return `@${ADJECTIVES[adjIndex]}-${NOUNS[nounIndex]}-${randomSuffix}`;
}
