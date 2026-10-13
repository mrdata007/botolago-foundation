export interface SocialAuthProviderInput {
  readonly authMode?: string;
  readonly google?: string;
  readonly apple?: string;
}

export interface SocialAuthProviders {
  readonly google: boolean;
  readonly apple: boolean;
}

function explicitlyEnabled(value: string | undefined): boolean {
  return value === "true";
}

export function resolveSocialAuthProviders(input: SocialAuthProviderInput): SocialAuthProviders {
  if (input.authMode !== "supabase") {
    return { google: false, apple: false };
  }
  return {
    google: explicitlyEnabled(input.google),
    apple: explicitlyEnabled(input.apple),
  };
}

export const SOCIAL_AUTH_PROVIDERS = resolveSocialAuthProviders({
  authMode: import.meta.env.VITE_AUTH_MODE,
  google: import.meta.env.VITE_AUTH_GOOGLE_ENABLED,
  apple: import.meta.env.VITE_AUTH_APPLE_ENABLED,
});

export const HAS_SOCIAL_AUTH_PROVIDER = SOCIAL_AUTH_PROVIDERS.google || SOCIAL_AUTH_PROVIDERS.apple;
