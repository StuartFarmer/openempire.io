import { generateCryptoRandomUUID } from "./Utils";

const PERSISTENT_ID_KEY = "player_persistent_id";

// WARNING: DO NOT EXPOSE THIS ID
export function getPersistentID(): string {
  const value = localStorage.getItem(PERSISTENT_ID_KEY);
  if (value) return value;

  const newID = generateCryptoRandomUUID();
  localStorage.setItem(PERSISTENT_ID_KEY, newID);

  return newID;
}

// Without an auth service the play token is just the persistent ID.
export async function getPlayToken(): Promise<string> {
  return getPersistentID();
}
