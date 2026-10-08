/* The onboarding page renderer, shared by onboarding.html (settings from the query string) and the
   single built page (settings from its toolbar). MC.ONB.page.render(out, options) fills `out`:
   one screen at the width of its frame, or every registered screen and variant in 390px phone
   frames, labelled above. It returns when the fonts are in and the scroll positions are set.

   options: c (the direction module, or undefined), slug (its file slug, e.g. "05-v2"),
   lang "fr" | "ar", scheme "light" | "dark", motion (allow the card beats), screen (one id) and
   variant (one variant key), only (a list of screen ids to show), exclude (ids to leave out). */
(function () {
  const MC = window.MC;
  const ONB = (MC.ONB = MC.ONB || {});
  const esc = MC.esc;

  ONB.page = {
    render: async (
      out,
      {
        c,
        slug = "",
        lang = "fr",
        scheme = "light",
        motion = false,
        screen: only = "",
        variant: onlyVariant = "",
        only: ids = null,
        exclude = [],
      } = {},
    ) => {
      lang = lang === "ar" ? "ar" : "fr";
      scheme = scheme === "dark" ? "dark" : "light";
      document.body.className = "app-" + scheme;
      document.documentElement.style.colorScheme = scheme;
      document.documentElement.lang = lang;
      const semelle = (c && c.n === 5) || /^05(?!\d)/.test(slug);

      const frames = [];
      const failed = (def, variant, e, wide) =>
        `<div class="onb ${wide ? "onb-desktop" : "onb-phone"} app-${scheme}" dir="${lang === "ar" ? "rtl" : "ltr"}" lang="${lang}"><div class="onb-missing" style="margin:16px;padding:16px;min-height:80px">screen ${esc(def.id)} / ${esc(variant.key)} failed: ${esc(e.message)}</div></div>`;
      function build(def, variant) {
        let env;
        let html;
        try {
          env = ONB.makeEnv(def, variant, { c, lang, scheme, motion });
          html = def.render(env);
        } catch (e) {
          console.warn(`[onboarding] ${def.id}/${variant.key}: ${e.message}`);
          html = failed(def, variant, e, def.desktop);
        }
        const slot = document.createElement("div");
        slot.className = "onbp-slot";
        slot.innerHTML = html;
        let root = slot.firstElementChild;
        if (!root || !root.classList.contains("onb")) {
          const wrap = document.createElement("div");
          wrap.className = "onb app-" + scheme;
          while (slot.firstChild) wrap.appendChild(slot.firstChild);
          slot.appendChild(wrap);
          root = wrap;
        }
        root.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
        root.setAttribute("lang", lang);
        if (semelle) {
          const tag = document.createElement("span");
          tag.className = "onbp-tag";
          tag.textContent = "Test culturel en attente";
          slot.dataset.semelle = "1";
          slot.prepend(tag);
        }
        frames.push({ def, variant, slot, root, env });
        return slot;
      }

      const registry = ONB.SCREENS.filter(
        (s) => !exclude.includes(s.id) && (!ids || ids.includes(s.id)),
      );
      out.removeAttribute("class");
      if (only) {
        const def = ONB.get(only);
        if (!def) {
          out.innerHTML = `<p class="onbp-note">No screen “${esc(only)}”. Registered: ${registry.map((s) => esc(s.id)).join(", ") || "none"}.</p>`;
          return;
        }
        const variant =
          def.variants.find((v) => v.key === onlyVariant) || (onlyVariant ? null : def.variants[0]);
        if (!variant) {
          out.innerHTML = `<p class="onbp-note">No variant “${esc(onlyVariant)}” on ${esc(def.id)}. Variants: ${def.variants.map((v) => esc(v.key)).join(", ")}.</p>`;
          return;
        }
        out.className = "onbp-single";
        out.innerHTML = "";
        out.appendChild(build(def, variant));
      } else {
        const toShow = registry.flatMap((def) => def.variants.map((v) => [def, v]));
        const head = document.createElement("header");
        head.className = "onbp-head";
        head.innerHTML =
          `<b>${esc(c ? c.name : slug || "no direction")}</b> · onboarding screens · ${lang} · ${scheme}` +
          ` · ${registry.length} screens, ${toShow.length} variants` +
          (semelle ? ` · <span class="onbp-tag">Test culturel en attente</span>` : "");
        const grid = document.createElement("div");
        grid.className = "onbp-grid";
        for (const [def, variant] of toShow) {
          const cell = document.createElement("section");
          cell.className = "onbp-cell" + (def.desktop ? " onbp-cell--wide" : "");
          cell.dataset.shot = `${def.id}-${variant.key}`;
          const label = document.createElement("div");
          label.className = "onbp-label";
          label.innerHTML =
            `<b>${esc(def.id)}</b> · ${esc(variant.key)} · ${esc(def.title)}` +
            `<small>${esc(def.moment || "")} · fixture ${esc(variant.fixture)} (sample)${variant.label ? " · " + esc(variant.label) : ""}</small>`;
          cell.appendChild(label);
          cell.appendChild(build(def, variant));
          grid.appendChild(cell);
        }
        out.innerHTML = "";
        if (!toShow.length) out.innerHTML = `<p class="onbp-note">No screen registered yet.</p>`;
        out.appendChild(head);
        out.appendChild(grid);
      }

      /* After the fonts are in: scroll positions, mounts, overflow notes, the desktop fit. */
      await document.fonts.ready;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      for (const fr of frames) {
        const scroller = fr.root.querySelector(".onb-scroll");
        if (scroller) {
          const to = scroller.dataset.scrollTo;
          const top = scroller.dataset.scrollTop;
          if (to) {
            const target = scroller.querySelector(to);
            if (target)
              scroller.scrollTop =
                target.getBoundingClientRect().top -
                scroller.getBoundingClientRect().top +
                scroller.scrollTop -
                8;
          } else if (top != null) scroller.scrollTop = Number(top);
          const extra = scroller.scrollHeight - scroller.clientHeight;
          fr.root.dataset.scrolls = extra > 2 ? String(extra) : "0";
          const small = fr.slot.parentElement?.querySelector(".onbp-label small");
          if (small && extra > 2) small.insertAdjacentText("beforeend", ` · scrolls (+${extra}px)`);
        }
        if (c && c.mount) {
          // A card that turns (Lucarne) would transition its back face in from 0 to 180 degrees
          // when it goes live, drawing it over the front for the first 300ms: mount at rest.
          fr.slot.classList.add("onbp-mounting");
          fr.slot.querySelectorAll('[data-onb-card="full"]').forEach((el) => {
            try {
              if (el.firstElementChild) c.mount(el.firstElementChild, fr.env ? fr.env.o : {});
            } catch (e) {
              console.warn("[onboarding] mount: " + e.message);
            }
          });
        }
        if (!only && fr.def.desktop) {
          const room = document.documentElement.clientWidth - 48;
          if (room < 1440) fr.slot.style.zoom = String(room / 1440);
        }
      }
      if (frames.some((fr) => fr.slot.classList.contains("onbp-mounting"))) {
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        frames.forEach((fr) => fr.slot.classList.remove("onbp-mounting"));
      }
      return frames;
    },
  };
})();
