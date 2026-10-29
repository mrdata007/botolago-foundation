export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
  );
const copy = {
  fr: {
    title: "Connecter votre administration",
    intro: "Autorisez cette application à utiliser vos droits d’administration BotolaGO.",
    email: "Adresse e-mail",
    password: "Mot de passe",
    next: "Continuer",
    code: "Code de vérification",
    mfa: "Vérifiez votre identité",
    totp: "Saisissez le code de votre application d’authentification.",
    phone: "Saisissez le code envoyé à votre téléphone.",
    connect: "Autoriser la connexion",
    renew: "Confirmer la nouvelle connexion",
    cancel: "Annuler",
    client: "Application",
    redirect: "Adresse de retour",
    consent:
      "Cette connexion permet de consulter et de modifier les données que votre rôle autorise, y compris de publier du contenu. Les règles d’approbation restent applicables. N’autorisez qu’une application que vous reconnaissez.",
    error:
      "La connexion a échoué. Vérifiez vos informations ou recommencez depuis votre application.",
    done: "Connexion vérifiée",
    doneText: "Revenez à votre conversation. Vous pouvez maintenant relancer votre demande.",
    expired: "Ce lien a expiré. Relancez la connexion depuis votre application.",
    help: "Utilisez votre compte administrateur existant. Les comptes sans mot de passe doivent d’abord en définir un sur botolago.com. Votre second facteur est obligatoire.",
    denied: "Connexion annulée",
  },
  ar: {
    title: "ربط لوحة الإدارة",
    intro: "اسمح لهذا التطبيق باستخدام صلاحياتك الإدارية في BotolaGO.",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    next: "متابعة",
    code: "رمز التحقق",
    mfa: "تأكيد هويتك",
    totp: "أدخل الرمز من تطبيق المصادقة.",
    phone: "أدخل الرمز المرسل إلى هاتفك.",
    connect: "السماح بالربط",
    renew: "تأكيد تسجيل الدخول مجدداً",
    cancel: "إلغاء",
    client: "التطبيق",
    redirect: "عنوان العودة",
    consent:
      "يتيح هذا الربط قراءة البيانات وتعديلها ضمن صلاحيات دورك، بما في ذلك نشر المحتوى. تبقى قواعد الموافقة سارية. لا تسمح إلا لتطبيق تعرفه.",
    error: "تعذر تسجيل الدخول. تحقق من معلوماتك أو ابدأ الربط مجدداً من تطبيقك.",
    done: "تم تأكيد تسجيل الدخول",
    doneText: "عُد إلى محادثتك. يمكنك الآن إعادة طلبك.",
    expired: "انتهت صلاحية هذا الرابط. ابدأ الربط مجدداً من تطبيقك.",
    help: "استخدم حسابك الإداري الحالي. إن لم تكن لحسابك كلمة مرور، عيّنها أولاً على botolago.com. التحقق بخطوتين مطلوب.",
    denied: "تم إلغاء الربط",
  },
};

export function renderPage({ id = "", pending, lang = "fr", error = false, state }) {
  const c = copy[lang] ?? copy.fr,
    rtl = lang === "ar",
    e = escapeHtml;
  const hidden = `<input type="hidden" name="id" value="${e(id)}"><input type="hidden" name="csrf" value="${e(pending?.csrf)}">`;
  let content;
  if (state)
    content = `<h1>${e(c[state] ?? c.done)}</h1><p role="status">${e(state === "expired" ? c.expired : state === "denied" ? c.denied : c.doneText)}</p>`;
  else {
    const mfa = pending.stage === "mfa";
    const fields = mfa
      ? `<p>${e(pending.factorType === "phone" ? c.phone : c.totp)}</p><label for="code">${e(c.code)}</label><input id="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" required dir="ltr" autofocus>`
      : `<p>${e(c.intro)}</p><label for="email">${e(c.email)}</label><input id="email" name="email" type="email" autocomplete="username" maxlength="254" required dir="ltr"><label for="password">${e(c.password)}</label><input id="password" name="password" type="password" autocomplete="current-password" maxlength="1024" required><p class="help">${e(c.help)}</p>`;
    content = `<h1>${e(mfa ? c.mfa : c.title)}</h1><dl><dt>${e(c.client)}</dt><dd><bdi>${e(pending.clientName ?? pending.clientId)}</bdi></dd>${pending.redirectUri ? `<dt>${e(c.redirect)}</dt><dd dir="ltr">${e(pending.redirectUri)}</dd>` : ""}</dl><p class="consent">${e(c.consent)}</p>${error ? `<p class="error" role="alert">${e(c.error)}</p>` : ""}<form action="/session/${mfa ? "verify" : "login"}" method="post">${hidden}${fields}<button type="submit">${e(mfa ? (pending.kind === "reauthenticate" ? c.renew : c.connect) : c.next)}</button></form><form action="/session/cancel" method="post">${hidden}<button type="submit" class="secondary">${e(c.cancel)}</button></form>`;
  }
  return `<!doctype html><html lang="${rtl ? "ar" : "fr"}" dir="${rtl ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>BotolaGO · Admin</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f5f5f7;color:#141820;font:16px/1.6 system-ui,sans-serif;padding:28px 16px;min-height:100vh;display:grid;place-items:center}.card{width:100%;max-width:520px;border:1px solid #e1e3e8;border-radius:20px;background:white;padding:32px;box-shadow:0 8px 35px #11182708}header{display:flex;gap:20px;align-items:center;justify-content:space-between}.brand{font-size:25px;font-weight:900;letter-spacing:-1px}.brand span{color:#126b51}a{color:#126b51}h1{font-size:clamp(24px,5vw,30px);line-height:1.25;letter-spacing:-.6px;margin:28px 0 16px}p{margin:16px 0}dl{background:#f5f5f7;border-radius:12px;padding:16px;font-size:14px}dt{font-weight:700}dd{margin:0 0 10px;overflow-wrap:anywhere;unicode-bidi:plaintext}dd:last-child{margin:0}label{display:block;margin:16px 0 6px;font-weight:650}input{font:inherit;width:100%;min-height:48px;padding:10px 12px;border:1px solid #8a919d;border-radius:10px;background:#fff;color:#141820}button{font:inherit;font-weight:700;border:0;background:linear-gradient(115deg,#126b51,#175a99);color:white;border-radius:999px;min-height:48px;width:100%;padding:12px 20px;margin-top:20px;cursor:pointer}.secondary{margin-top:12px;background:white;color:#26313d;border:1px solid #8a919d}.help,.consent{font-size:14px;color:#424b58}.error{background:#fff0f0;border:1px solid #a82b36;border-radius:10px;padding:12px;color:#8e1f2c}a:focus-visible,input:focus-visible,button:focus-visible{outline:3px solid #177565;outline-offset:3px}@media(max-width:420px){.card{padding:22px 18px}body{padding:16px 12px}}
  </style></head><body><main class="card"><header><div class="brand" aria-label="BotolaGO">Botola<span>GO</span></div>${pending ? `<nav aria-label="Language"><a href="/session/start?id=${e(id)}&amp;lang=fr" lang="fr">Français</a> · <a href="/session/start?id=${e(id)}&amp;lang=ar" lang="ar" dir="rtl">العربية</a></nav>` : ""}</header>${content}</main></body></html>`;
}
