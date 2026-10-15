import { z } from "zod";
import { NEEDS_POINTING_LABEL } from "../shared/constants.ts";

// A header or query-param name. " " or "X-User-Id " would never match a request, so they
// are trimmed and a whitespace-only value counts as unset, like a blank one does.
function identityName() {
  return z
    .string()
    .trim()
    .transform((value) => (value === "" ? undefined : value))
    .optional();
}

// Every field is optional or defaulted, so an empty environment parses. Blank values are
// dropped before parsing (see env()), which is what keeps optional fields undefined.
const schema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3838),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  JIRA_BASE_URL: z.url().optional(),
  JIRA_API_TOKEN_USERNAME: z.string().min(1).optional(),
  JIRA_API_TOKEN_PASSWORD: z.string().min(1).optional(),
  JIRA_STORY_POINTS_FIELD: z
    .string()
    .regex(/^customfield_\d+$/)
    .optional(),
  JIRA_DEFAULT_PROJECT: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]*$/i)
    .optional(),
  // A board name, or a numeric id (the number in .../boards/123). Resolved against Jira at
  // bootstrap, so any non-empty text is accepted here. Needs JIRA_DEFAULT_PROJECT.
  JIRA_DEFAULT_BOARD: z.string().trim().min(1).optional(),
  JIRA_NEEDS_POINTING_LABEL: z.string().min(1).default(NEEDS_POINTING_LABEL),
  // Comma-separated in the environment; exposed as a trimmed list with empties dropped.
  ALLOWED_ORIGINS: z
    .string()
    .optional()
    .transform((value) =>
      value
        ?.split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ALLOW_DEV_USER: z.string().optional(),
  IDENTITY_USER_ID_HEADER: identityName(),
  IDENTITY_USERNAME_HEADER: identityName(),
  IDENTITY_USER_ID_QUERY: identityName(),
  IDENTITY_USERNAME_QUERY: identityName(),
  DEV_USER_ID: z.string().optional(),
  DEV_USERNAME: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/**
 * The only place that reads process.env (proxy-identity.ts is the one documented exception).
 * Call it inside functions, never at module scope: it parses on first call and memoizes.
 */
export function env(): Env {
  if (cached) return cached;

  const raw: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    // Container platforms often pass blanks; treat them as unset.
    if (value !== undefined && value !== "") raw[name] = value;
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    // Names only: values can be secrets, so they must never reach an error message.
    const names = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(`Invalid environment variables: ${names.join(", ")}`);
  }
  cached = result.data;
  return cached;
}
