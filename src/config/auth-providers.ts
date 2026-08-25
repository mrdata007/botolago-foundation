import { IS_DEMO_MODE } from "./app-mode";

export interface SocialAuthProviderInput {
  readonly google?: string;
  readonly apple?: string;
  readonly demoMode: boolean;
}

export interface SocialAuthProviders {
  readonly google: boolean;
  readonly apple: boolean;
}

function explicitlyEnabled(value: string | undefined): boolean {
  return value === "true";
}

export function resolveSocialAuthProviders(
  input: SocialAuthProviderInput,
): SocialAuthProviders {
  if (input.demoMode) {
    return { google: false, apple: false };
  }
  return {
    google: explicitlyEnabled(input.google),
    apple: explicitlyEnabled(input.apple),
  };
}

export const SOCIAL_AUTH_PROVIDERS = resolveSocialAuthProviders({
  google: import.meta.env.VITE_AUTH_GOOGLE_ENABLED,
  apple: import.meta.env.VITE_AUTH_APPLE_ENABLED,
  demoMode: IS_DEMO_MODE,
});

export const HAS_SOCIAL_AUTH_PROVIDER =
  SOCIAL_AUTH_PROVIDERS.google || SOCIAL_AUTH_PROVIDERS.apple;
