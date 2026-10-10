import { getAdminCopy } from "@/backend/admin/route-access";

export type StoryNotice = { error: boolean; text: string; reauthenticate?: boolean };

export function storyErrorNotice(error: unknown, lang: "fr" | "ar"): StoryNotice {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("recent_auth_required")) {
    return {
      error: true,
      text: getAdminCopy(lang).states.recent_auth_required.description,
      reauthenticate: true,
    };
  }
  return {
    error: true,
    text: message.includes("story_conflict")
      ? lang === "ar"
        ? "عُدّلت القصة في مكان آخر. أعد تحميل القائمة ثم افتح القصة من جديد."
        : "Cette story a été modifiée ailleurs. Actualisez la liste puis rouvrez-la."
      : lang === "ar"
        ? "تعذّر إتمام العملية. تحقق من الصورة والحقول وصلاحياتك ثم أعد المحاولة."
        : "Opération impossible. Vérifiez l’image, les champs et vos droits, puis réessayez.",
  };
}
