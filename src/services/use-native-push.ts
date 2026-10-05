import { useCallback, useEffect, useState } from "react";

import { isMfaStepUpError } from "@/backend/auth/step-up";
import { useI18n } from "@/i18n/provider";
import { nativePlatform } from "@/lib/native-app";
import {
  enablePush,
  switchOffThisPhone,
  type EnableOutcome,
  type PushPermission,
} from "@/services/native-push";
import { loadNativePushDeps, loadNativePushPermission } from "@/services/native-push-runtime";
import { useMyNotificationPreferences } from "@/services/use-notification-preferences";

export type PushSwitchResult = "ok" | Extract<EnableOutcome, { ok: false }>["reason"];

/**
 * The Push switch of the profile's notification settings.
 *
 * `available` is true only inside the phone app: in a browser the switch is not
 * shown (alerts come from Apple and Google, through the app). It starts false on
 * the server and on first render and is set afterwards, so a page is never
 * rendered differently on the server and the first time on the client.
 *
 * `enabled` means "the account wants push AND this phone is allowed to show it":
 * the account's choice lives on the server and covers every phone it has, so a
 * phone that was never asked (or said no) shows Off and asks when it is turned on.
 *
 * Turning it on is the one place the phone's permission is asked for.
 */
export function useNativePushSwitch(): {
  available: boolean;
  loaded: boolean;
  enabled: boolean;
  busy: boolean;
  /** The phone's own answer, once known: "denied" means it has to be changed in the phone's settings. */
  permission: PushPermission | null;
  turnOn: () => Promise<PushSwitchResult>;
  turnOff: () => Promise<"ok" | "mfa" | "error">;
} {
  const { lang } = useI18n();
  const { preferences, setPushEnabled } = useMyNotificationPreferences();
  const [available, setAvailable] = useState(false);
  const [permission, setPermission] = useState<PushPermission | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!nativePlatform()) return;
    setAvailable(true);
    let cancelled = false;
    void loadNativePushPermission().then((state) => {
      if (!cancelled) setPermission(state);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const turnOn = useCallback(async (): Promise<PushSwitchResult> => {
    setBusy(true);
    try {
      const deps = await loadNativePushDeps(lang);
      if (!deps) return "unavailable";
      const outcome = await enablePush(deps);
      if (!outcome.ok) {
        if (outcome.reason === "denied") setPermission("denied");
        return outcome.reason;
      }
      setPermission("granted");
      try {
        await setPushEnabled(true);
      } catch (error) {
        // The phone is registered but the account's choice was not saved: let go
        // of the phone again rather than leave the two disagreeing.
        await switchOffThisPhone(deps);
        return isMfaStepUpError(error) ? "mfa" : "error";
      }
      return "ok";
    } catch {
      return "error";
    } finally {
      setBusy(false);
    }
  }, [lang, setPushEnabled]);

  const turnOff = useCallback(async (): Promise<"ok" | "mfa" | "error"> => {
    setBusy(true);
    try {
      try {
        await setPushEnabled(false);
      } catch (error) {
        return isMfaStepUpError(error) ? "mfa" : "error";
      }
      const deps = await loadNativePushDeps(lang).catch(() => null);
      if (deps) await switchOffThisPhone(deps);
      return "ok";
    } finally {
      setBusy(false);
    }
  }, [lang, setPushEnabled]);

  return {
    available,
    loaded: preferences !== undefined && (!available || permission !== null),
    enabled: preferences?.channels.push === true && permission === "granted",
    busy,
    permission,
    turnOn,
    turnOff,
  };
}
