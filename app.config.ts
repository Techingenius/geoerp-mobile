import { ExpoConfig, ConfigContext } from "expo/config";

// The production Supabase project. Not a secret: this ref is in the URL that
// every shipped APK already embeds, and it is written here for one reason — it
// is the only way a build can tell, on the build worker, that it is about to
// ship QA a binary pointing at live field data.
const PRODUCTION_SUPABASE_REF = "vwyfkqjhawrycskuqbpw";

/**
 * `abc123` out of `https://abc123.supabase.co`; a local stack has no ref.
 * Lower-cased: a hostname is case-insensitive, so `https://VWYFK….supabase.co`
 * is the production project and has to compare equal to it. This is a safety
 * check, and a safety check that can be defeated by holding shift is not one.
 */
const supabaseRef = (url: string): string => {
  if (!url) return "unset";
  const ref = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1];
  return ref ? ref.toLowerCase() : "custom";
};

export default ({ config }: ConfigContext): ExpoConfig => {
  // Set by EAS on the build worker; undefined for `expo start` and for tests.
  const profile = process.env.EAS_BUILD_PROFILE;
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
  const ref = supabaseRef(supabaseUrl);

  // GRA-973, mobile delivery contract: a QA build that points at production is
  // not reviewable — approving it would mean a reviewer creating real projects,
  // services and production entries to exercise the screens. Fail here, where
  // the message lands in the EAS build log, rather than three weeks later in a
  // field report. `preview` is deliberately exempt: until the staging project
  // exists it is the only profile that can produce an installable APK at all,
  // and the contract already forbids reviewing what it builds.
  if (profile === "qa") {
    if (ref === "unset") {
      throw new Error(
        "eas build --profile qa: EXPO_PUBLIC_SUPABASE_URL is empty. The qa " +
          "profile reads the EAS `development` environment, which holds the " +
          "STAGING variables (`preview` holds production). Create them first: " +
          "eas env:create development --name EXPO_PUBLIC_SUPABASE_URL " +
          "--value https://<staging-ref>.supabase.co — the other two are in " +
          "docs/mobile-delivery-contract.md.",
      );
    }
    if (ref === PRODUCTION_SUPABASE_REF) {
      throw new Error(
        "eas build --profile qa points at the PRODUCTION Supabase project " +
          `(${PRODUCTION_SUPABASE_REF}). A QA build against production is not ` +
          "reviewable — see docs/mobile-delivery-contract.md. Point the EAS " +
          "`development` environment at the staging project and rebuild: " +
          "eas env:update development --variable-name EXPO_PUBLIC_SUPABASE_URL " +
          "--value https://<staging-ref>.supabase.co. Do NOT repoint " +
          "`preview` — that is what today's preview-build APKs install.",
      );
    }
  }

  return {
    ...config,
    name: config.name!,
    slug: config.slug!,
    android: {
      ...config.android,
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
        },
      },
    },
    extra: {
      ...config.extra,
      // Read back by the delivery block: which backend this binary talks to is
      // part of the evidence, and nobody should have to guess it from a URL.
      backend: {
        ref,
        profile: profile ?? "local",
        isProduction: ref === PRODUCTION_SUPABASE_REF,
      },
    },
  };
};
