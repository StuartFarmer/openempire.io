import { ClanTagSchema, UsernameSchema } from "../Schemas";

export const MIN_USERNAME_LENGTH = 3;
export const MAX_USERNAME_LENGTH = 27;
export const MIN_CLAN_TAG_LENGTH = 2;
export const MAX_CLAN_TAG_LENGTH = 5;

export function validateUsername(username: string): {
  isValid: boolean;
  error?: string;
} {
  const parsed = UsernameSchema.safeParse(username);

  if (!parsed.success) {
    const errType = parsed.error.issues[0].code;

    if (errType === "invalid_type") {
      return { isValid: false, error: "username.not_string" };
    }

    if (errType === "too_small") {
      return {
        isValid: false,
        error: "username.too_short",
      };
    }

    if (errType === "too_big") {
      return {
        isValid: false,
        error: "username.too_long",
      };
    }

    // Invalid regex, or any other issue
    else {
      return { isValid: false, error: "username.invalid_chars" };
    }
  }

  // All checks passed
  return { isValid: true };
}

export function validateClanTag(clanTag: string): {
  isValid: boolean;
  error?: string;
} {
  if (clanTag.length === 0) {
    return { isValid: true };
  }
  if (clanTag.length < MIN_CLAN_TAG_LENGTH) {
    return { isValid: false, error: "username.tag_too_short" };
  }
  if (clanTag.length > MAX_CLAN_TAG_LENGTH) {
    return { isValid: false, error: "username.tag_too_long" };
  }

  const parsed = ClanTagSchema.safeParse(clanTag);
  if (!parsed.success) {
    return {
      isValid: false,
      error: "username.tag_invalid_chars",
    };
  }

  return { isValid: true };
}
