// The little JavaScript the app needs, served at /assets/app.js. Every page is rendered on the
// server; this makes the picker quicker and solves the bot challenge on public forms.
export const js = String.raw`
(() => {
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

  // The platform asks strangers' POSTs to public pages for a proof of work (routes.challenge).
  // Try sha256(salt + n) for each n until it matches, then send the answer in X-Altcha.
  const solve = async (c) => {
    const enc = new TextEncoder();
    for (let n = 0; n <= c.maxnumber; n++) {
      if (hex(await crypto.subtle.digest("SHA-256", enc.encode(c.salt + n))) === c.challenge)
        return btoa(JSON.stringify({ algorithm: c.algorithm, challenge: c.challenge, number: n, salt: c.salt, signature: c.signature }));
    }
    throw new Error("unsolved");
  };

  const show = async (res) => {
    if (res.redirected) { location.href = res.url; return; }
    // A page the server rendered for this post (a form with errors, a time just taken): swap it
    // in. The listeners on document stay, so the new page works the same.
    const page = new DOMParser().parseFromString(await res.text(), "text/html");
    document.title = page.title;
    document.body.replaceWith(document.adoptNode(page.body));
    window.scrollTo(0, 0);
  };

  // Forms post through fetch so a challenge can be solved and the post sent again.
  document.addEventListener("submit", async (e) => {
    const form = e.target;
    const msg = form.getAttribute("data-confirm");
    if (msg && !confirm(msg)) { e.preventDefault(); return; }
    if ((form.method || "").toLowerCase() !== "post" || !window.fetch || !crypto.subtle) return;
    e.preventDefault();
    const button = e.submitter || form.querySelector("button[type=submit], button:not([type])");
    const body = new URLSearchParams(new FormData(form, e.submitter));
    const label = button ? [...button.childNodes] : [];
    if (button) { button.disabled = true; button.setAttribute("aria-busy", "true"); }
    const send = (altcha) => fetch(form.action, { method: "POST", body, headers: altcha ? { "X-Altcha": altcha } : {}, credentials: "same-origin" });
    try {
      let res = await send();
      if (res.status === 403) {
        const err = await res.clone().json().catch(() => null);
        const ch = err && err.error && err.error.code === "CHALLENGE_REQUIRED" && err.error.details && err.error.details.challenge;
        if (ch) {
          if (button) button.textContent = "Checking…";
          res = await send(await solve(ch));
        }
      }
      await show(res);
    } catch {
      if (button) { button.disabled = false; button.removeAttribute("aria-busy"); button.replaceChildren(...label); }
      alert("That didn't go through. Check your connection and try again.");
    }
  });

  // Show times in the visitor's own zone: the first visit to the picker adds it to the address.
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const picker = document.querySelector("[data-tz]");
  if (picker && zone) {
    const url = new URL(location.href);
    if (!url.searchParams.has("tz") && zone !== picker.dataset.tz) { url.searchParams.set("tz", zone); location.replace(url); }
  }
  document.addEventListener("change", (e) => {
    if (e.target.matches("select[data-go]")) {
      const url = new URL(location.href);
      url.searchParams.set(e.target.name, e.target.value);
      location.href = url;
    }
  });

  // Picking a time takes two taps, so a slip doesn't book: the first shows Next beside it.
  document.addEventListener("click", (e) => {
    const time = e.target.closest(".slot a.time");
    if (!time) return;
    const slot = time.parentElement;
    if (slot.classList.contains("picked")) return;
    e.preventDefault();
    document.querySelectorAll(".slot.picked").forEach((s) => s.classList.remove("picked"));
    slot.classList.add("picked");
    slot.querySelector("a.next").focus({ preventScroll: true });
  });

  // Month and day links swap the picker in place instead of reloading the page.
  document.addEventListener("click", async (e) => {
    const a = e.target.closest("a[data-swap]");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const target = document.querySelector(a.dataset.swap);
    if (!target) return;
    e.preventDefault();
    try {
      const res = await fetch(a.href, { credentials: "same-origin" });
      const doc = new DOMParser().parseFromString(await res.text(), "text/html");
      const next = doc.querySelector(a.dataset.swap);
      if (!res.ok || !next) throw new Error();
      target.replaceWith(next);
      history.pushState({}, "", a.href);
    } catch { location.href = a.href; }
  });
  addEventListener("popstate", () => location.reload());

  // Copy buttons.
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-copy]");
    if (!b) return;
    const field = document.getElementById(b.dataset.copy);
    try { await navigator.clipboard.writeText(field.value); } catch { field.select(); document.execCommand("copy"); }
    const was = [...b.childNodes];
    b.textContent = "Copied";
    setTimeout(() => b.replaceChildren(...was), 1500);
  });

  // Weekly hours: add and remove shifts without a round trip.
  document.addEventListener("click", (e) => {
    const add = e.target.closest("[data-add-shift]");
    if (add) {
      const list = add.closest(".week-row").querySelector(".shifts");
      const tpl = document.getElementById("shift-template");
      const row = tpl.content.firstElementChild.cloneNode(true);
      row.querySelectorAll("input").forEach((i) => (i.name = i.name.replace("DAY", add.dataset.addShift)));
      list.append(row);
      row.querySelector("input").focus();
    }
    const remove = e.target.closest("[data-remove-shift]");
    if (remove) remove.closest(".shift").remove();
  });
})();
`;
