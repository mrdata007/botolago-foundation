export const OAUTH_CONSENT_COPY = {
  fr: {
    errorTitle: "Erreur d’autorisation",
    errorBody:
      "Impossible de charger cette demande d’autorisation. Revenez à l’application et réessayez.",
    noRedirect: "Le serveur d’autorisation n’a renvoyé aucune destination.",
    clientFallback: "une application",
    title: (client: string) => `Connecter ${client} à BotolaGO`,
    description: (client: string) =>
      `${client} pourra utiliser BotolaGO en votre nom pour consulter votre profil, votre équipe Fantasy et les matchs via les outils MCP. Vos données restent soumises aux règles d’accès de BotolaGO.`,
    scopes: "Accès demandés",
    approve: "Autoriser",
    deny: "Refuser",
  },
  ar: {
    errorTitle: "خطأ في التفويض",
    errorBody: "تعذّر تحميل طلب التفويض. ارجع إلى التطبيق وحاول مرة أخرى.",
    noRedirect: "لم يُرجع خادم التفويض وجهة للمتابعة.",
    clientFallback: "تطبيق",
    title: (client: string) => `ربط ${client} بـ BotolaGO`,
    description: (client: string) =>
      `سيتمكن ${client} من استخدام BotolaGO نيابةً عنك للاطلاع على ملفك وفريق الفانتازي والمباريات عبر أدوات MCP. تظل بياناتك خاضعة لقواعد الوصول في BotolaGO.`,
    scopes: "الصلاحيات المطلوبة",
    approve: "سماح",
    deny: "رفض",
  },
} as const;
