function readRequiredEnv(value: string | undefined, key: string): string {
  if (value === undefined) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value.trim();
}

const NEXT_PUBLIC_BE_API_URL = readRequiredEnv(
  process.env.NEXT_PUBLIC_BE_API_URL,
  "NEXT_PUBLIC_BE_API_URL"
);
const NEXT_PUBLIC_API_URL = readRequiredEnv(
  process.env.NEXT_PUBLIC_API_URL,
  "NEXT_PUBLIC_API_URL"
);
const NEXT_PUBLIC_GOOGLE_API_KEY = readRequiredEnv(
  process.env.NEXT_PUBLIC_GOOGLE_API_KEY,
  "NEXT_PUBLIC_GOOGLE_API_KEY"
);
const NEXT_PUBLIC_ANALYTICS_ID = readRequiredEnv(
  process.env.NEXT_PUBLIC_ANALYTICS_ID,
  "NEXT_PUBLIC_ANALYTICS_ID"
);
const NODE_ENV = readRequiredEnv(process.env.NODE_ENV, "NODE_ENV");

export const publicEnv = Object.freeze({
  NEXT_PUBLIC_BE_API_URL,
  NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_GOOGLE_API_KEY,
  NEXT_PUBLIC_ANALYTICS_ID,
  NODE_ENV: NODE_ENV || "development",
});

if (!publicEnv.NEXT_PUBLIC_BE_API_URL) {
  throw new Error("NEXT_PUBLIC_BE_API_URL must not be empty");
}
