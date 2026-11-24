// The whole stylesheet, served at /assets/app.css. The look follows the training portal example:
// warm paper, one accent color the business picks, and the thread as the way to show progress.
export const css = String.raw`
@font-face { font-family: "Figtree"; font-style: normal; font-weight: 300 900; font-display: swap; src: url(/assets/fonts/figtree-latin-wght-normal.woff2) format("woff2"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
@font-face { font-family: "Figtree"; font-style: normal; font-weight: 300 900; font-display: swap; src: url(/assets/fonts/figtree-latin-ext-wght-normal.woff2) format("woff2"); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
:root {
  --bg: #f7f5f0; --surface: #ffffff; --surface-2: #f0ede6; --ink: #1f1d1a; --muted: #6b665d;
  --line: #e3dfd6; --line-strong: #cfc9bd; --good: #2f8a57; --bad: #c23b3b;
  --accent: #e85d2a; --on-accent: #ffffff;
  --accent-soft: color-mix(in oklab, var(--accent) 14%, transparent);
  --accent-ink: color-mix(in oklab, var(--accent) 78%, var(--ink));
  --shadow: 0 1px 2px rgb(30 25 15 / .06), 0 8px 24px -8px rgb(30 25 15 / .16);
  --radius: 16px; --font: "Figtree", system-ui, sans-serif; --mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #121110; --surface: #1b1a18; --surface-2: #25231f; --ink: #f1ede6; --muted: #a39d92;
    --line: #322f2a; --line-strong: #4a463f; --good: #5cc48a; --bad: #ef6b6b;
    --accent-ink: color-mix(in oklab, var(--accent) 70%, white);
    --shadow: 0 1px 2px rgb(0 0 0 / .4), 0 10px 30px -10px rgb(0 0 0 / .7);
    color-scheme: dark;
  }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 400 17px/1.6 var(--font); -webkit-font-smoothing: antialiased; }
a { color: inherit; }
img { max-width: 100%; }
h1, h2, h3 { line-height: 1.2; letter-spacing: -0.015em; margin: 0 0 .4em; }
h1 { font-size: clamp(2rem, 4.5vw, 3rem); font-weight: 750; }
h2 { font-size: 1.5rem; font-weight: 700; }
h3 { font-size: 1.15rem; font-weight: 650; }
p { margin: 0 0 1em; }
.icon { flex: none; vertical-align: -0.2em; }
.wrap { max-width: 1120px; margin: 0 auto; padding: 0 24px; }
.muted { color: var(--muted); }
.small { font-size: .875rem; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; border-radius: 6px; }

/* Header */
.site-header { border-bottom: 1px solid var(--line); background: color-mix(in oklab, var(--bg) 88%, transparent); backdrop-filter: blur(10px); position: sticky; top: 0; z-index: 10; }
.site-header .wrap { display: flex; align-items: center; gap: 24px; height: 64px; }
.brand { display: flex; align-items: center; gap: 10px; min-width: 0; white-space: nowrap; font-weight: 750; font-size: 1.1rem; text-decoration: none; letter-spacing: -0.01em; }
.brand-name { overflow: hidden; text-overflow: ellipsis; }
.brand-dot { flex: none;  width: 14px; height: 14px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 4px var(--accent-soft); }
.nav { display: flex; gap: 4px; margin-left: auto; align-items: center; }
.nav a { text-decoration: none; padding: 8px 12px; border-radius: 10px; color: var(--muted); font-weight: 550; font-size: .95rem; display: inline-flex; gap: 6px; align-items: center; }
.nav a:hover, .nav a[aria-current] { color: var(--ink); background: var(--surface-2); }
@media (max-width: 640px) { .nav a span.label { display: none; } .site-header .wrap { gap: 12px; } }

/* Buttons and badges */
.btn { display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink); font: 600 .95rem/1 var(--font); padding: 12px 18px; border-radius: 12px; text-decoration: none; cursor: pointer; transition: transform .12s, box-shadow .12s, background .12s; }
.btn:hover { transform: translateY(-1px); box-shadow: var(--shadow); }
.btn:active { transform: none; }
.btn.primary { background: var(--accent); border-color: transparent; color: var(--on-accent); }
.btn.ghost { background: transparent; border-color: transparent; }
.btn.ghost:hover { background: var(--surface-2); box-shadow: none; }
.btn.small { padding: 8px 12px; font-size: .85rem; border-radius: 10px; }
.btn.danger { color: var(--bad); }
.btn[disabled] { opacity: .5; pointer-events: none; }
.badge { display: inline-flex; align-items: center; gap: 4px; font: 650 .72rem/1 var(--font); text-transform: uppercase; letter-spacing: .06em; padding: 5px 8px; border-radius: 999px; background: var(--surface-2); color: var(--muted); white-space: nowrap; }
.badge.accent { background: var(--accent); color: var(--on-accent); }
.badge.good { background: color-mix(in oklab, var(--good) 16%, transparent); color: var(--good); }
.row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.spread { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }

/* Notices, empty states, tables, forms */
.notice { padding: 14px 18px; border-radius: 12px; background: var(--surface-2); margin: 0 0 20px; }
.notice.error { background: color-mix(in oklab, var(--bad) 12%, transparent); color: var(--ink); }
.notice.good { background: color-mix(in oklab, var(--good) 12%, transparent); }
.empty { text-align: center; padding: 64px 24px; border: 2px dashed var(--line); border-radius: 20px; color: var(--muted); }
.empty h2 { color: var(--ink); }
.panel { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 24px; }
.table { width: 100%; border-collapse: collapse; font-size: .95rem; }
.table th { text-align: left; font-weight: 600; color: var(--muted); font-size: .8rem; text-transform: uppercase; letter-spacing: .05em; padding: 10px 12px; border-bottom: 1px solid var(--line); }
.table td { padding: 12px; border-bottom: 1px solid var(--line); vertical-align: middle; }
.table tr:last-child td { border-bottom: 0; }
.table-wrap { overflow-x: auto; }
.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 18px; }
.field label, .label { font-weight: 600; font-size: .9rem; }
.field .hint { color: var(--muted); font-size: .82rem; }
input[type=text], input[type=email], input[type=number], input[type=date], input[type=search], input[type=url], textarea, select { font: inherit; font-size: .95rem; color: var(--ink); background: var(--surface); border: 1px solid var(--line-strong); border-radius: 10px; padding: 10px 12px; width: 100%; }
input[type=color] { width: 52px; height: 40px; border: 1px solid var(--line-strong); border-radius: 10px; background: var(--surface); padding: 3px; }
textarea { min-height: 120px; resize: vertical; line-height: 1.55; }
textarea.code { font-family: var(--mono); font-size: .88rem; min-height: 360px; }
input:focus, textarea:focus, select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.check { display: flex; gap: 10px; align-items: center; font-weight: 550; }
.check input { accent-color: var(--accent); width: 18px; height: 18px; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 18px; }
.grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0 18px; }
@media (max-width: 640px) { .grid-2, .grid-3 { grid-template-columns: 1fr; } }

/* People, marking, settings */
.badge.warn { background: color-mix(in oklab, #d99a1c 18%, transparent); color: #a8730c; }
.badge.bad { background: color-mix(in oklab, var(--bad) 14%, transparent); color: var(--bad); }
.subnav { margin-top: 12px; flex-wrap: wrap; }
.count-pill { background: var(--on-accent); color: var(--accent-ink); border-radius: 99px; padding: 2px 7px; font-size: .75rem; line-height: 1.2; }
.btn.ghost .count-pill { background: var(--accent); color: var(--on-accent); }
.toolbar { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 16px; }
.filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 0; }
.filters input[type=search] { width: 220px; }
.filters select { width: auto; }
.stack { display: grid; gap: 20px; max-width: 760px; }
.rule { border: 0; border-top: 1px solid var(--line); margin: 24px 0; }
.tabs a.tab { font: 600 .9rem var(--font); padding: 8px 14px; border-radius: 9px; color: var(--muted); text-decoration: none; }
.tabs a.tab[aria-selected=true] { background: var(--surface-2); color: var(--ink); }
.menu { position: relative; display: inline-block; }
.menu summary { list-style: none; }
.menu summary::-webkit-details-marker { display: none; }
.menu-body { position: absolute; right: 0; top: calc(100% + 4px); z-index: 5; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); padding: 6px; display: grid; gap: 2px; min-width: 220px; text-align: left; }
.menu-body form { margin: 0; }
.menu-body .btn { width: 100%; justify-content: flex-start; }
.segmented { display: inline-flex; width: fit-content; border: 1px solid var(--line-strong); border-radius: 12px; padding: 3px; gap: 3px; flex-wrap: wrap; }
.segmented label { margin: 0; }
.segmented input { position: absolute; opacity: 0; pointer-events: none; }
.segmented span { display: block; padding: 8px 14px; border-radius: 9px; font-weight: 600; font-size: .9rem; cursor: pointer; color: var(--muted); }
.segmented input:checked + span { background: var(--accent); color: var(--on-accent); }
.segmented input:focus-visible + span { outline: 3px solid var(--accent); outline-offset: 2px; }
.events { border: 0; padding: 0; margin: 0 0 16px; display: grid; gap: 6px; }
.events legend { margin-bottom: 8px; }
.codeblock { background: var(--surface-2); border-radius: 12px; padding: 14px 16px; overflow-x: auto; font: .8rem/1.6 var(--mono); white-space: pre; }
tr.faded td { opacity: .55; }

/* ---- Booking page ---- */
.public-hero { padding: 64px 0 28px; }
.public-hero p.lead { font-size: 1.2rem; color: var(--muted); max-width: 40rem; margin: 0; }
.service-list { display: grid; gap: 14px; padding-bottom: 72px; }
.service-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0 22px; align-items: center; background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 22px 24px 22px 30px; box-shadow: inset 6px 0 0 var(--accent); text-decoration: none; transition: transform .15s, box-shadow .15s, border-color .15s; overflow: hidden; }
.service-row:hover { transform: translateY(-2px); box-shadow: inset 6px 0 0 var(--accent), var(--shadow); border-color: var(--line-strong); }
.service-row h2 { font-size: 1.25rem; margin: 0 0 4px; }
.service-row p { color: var(--muted); margin: 6px 0 0; max-width: 46rem; }
.service-row .go { display: flex; align-items: center; gap: 14px; }
.service-row .go .icon { color: var(--accent-ink); transition: transform .15s; }
.service-row:hover .go .icon { transform: translateX(3px); }
@media (max-width: 640px) { .service-row { grid-template-columns: minmax(0, 1fr); padding-right: 20px; } .service-row .go { margin-top: 12px; } }
.meta { display: flex; flex-wrap: wrap; gap: 4px 18px; color: var(--muted); font-weight: 550; }
.meta span { display: inline-flex; align-items: center; gap: 6px; }
.meta .price { color: var(--ink); font-weight: 700; }
.faces { display: flex; }
.face { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; font: 700 .78rem/1 var(--font); color: var(--accent-ink); background: color-mix(in oklab, var(--accent) 16%, var(--surface)); border: 2px solid var(--surface); flex: none; }
.faces .face + .face { margin-left: -9px; }
.face.lg { width: 44px; height: 44px; font-size: .9rem; }
.price { font-weight: 700; font-variant-numeric: tabular-nums; }

/* Steps: the thread, sideways. The step you are on pops out of the line. */
.steps { list-style: none; display: flex; padding: 0; margin: 28px 0 22px; gap: 0; counter-reset: step; }
.steps li { flex: 1; position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; font-size: .85rem; font-weight: 600; color: var(--muted); }
.steps li::before { content: ""; position: absolute; top: 7px; left: 0; right: 0; height: 2px; background: var(--line); }
.steps li:first-child::before { left: 7px; }
.steps li:last-child { flex: 0 0 auto; }
.steps li:last-child::before { display: none; }
.steps li.done::before { background: var(--accent); }
.steps .dot { position: relative; z-index: 1; width: 16px; height: 16px; border-radius: 50%; background: var(--surface); border: 2px solid var(--line-strong); display: grid; place-items: center; color: var(--on-accent); }
.steps .dot .icon { width: 10px; height: 10px; stroke-width: 3.5; }
.steps li.done .dot { background: var(--accent); border-color: var(--accent); }
.steps li.current { color: var(--ink); }
.steps li.current .dot { width: 22px; height: 22px; margin: -3px 0 -3px -3px; background: var(--accent); border-color: var(--accent); box-shadow: 0 0 0 6px var(--accent-soft); animation: pulse 2.4s ease-in-out infinite; }
.steps a { text-decoration: none; }
@keyframes pulse { 50% { box-shadow: 0 0 0 10px transparent; } }

.booker { display: grid; grid-template-columns: 300px minmax(0, 1fr) 260px; background: var(--surface); border: 1px solid var(--line); border-radius: 22px; box-shadow: var(--shadow); margin-bottom: 72px; min-height: 520px; }
.booker.two { grid-template-columns: 300px minmax(0, 1fr); }
.booker > section { padding: 30px; min-width: 0; }
.booker > section + section { border-left: 1px solid var(--line); }
.summary .kicker { color: var(--accent-ink); font-weight: 650; font-size: .9rem; display: block; margin-bottom: 6px; }
.summary h1 { font-size: 1.6rem; margin-bottom: 14px; }
.facts { list-style: none; padding: 0; margin: 0 0 18px; display: grid; gap: 10px; color: var(--muted); font-weight: 550; }
.facts li { display: flex; gap: 10px; align-items: flex-start; }
.facts li .icon { margin-top: 3px; }
.facts li.chosen { color: var(--ink); font-weight: 700; }
.summary p.desc { color: var(--muted); font-size: .95rem; }
.who { display: grid; gap: 6px; margin-top: 18px; }
.who .label { margin-bottom: 4px; }
.who a { display: flex; gap: 10px; align-items: center; padding: 7px 10px 7px 7px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: .95rem; border: 1px solid transparent; }
.who a:hover { background: var(--surface-2); }
.who a[aria-current] { border-color: var(--accent); background: var(--accent-soft); }
.who .face { width: 30px; height: 30px; font-size: .72rem; border: 0; }
.who .any { background: var(--surface-2); color: var(--muted); }

.cal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
.cal-head h2 { font-size: 1.15rem; margin: 0; }
.cal { width: 100%; border-collapse: separate; border-spacing: 4px; table-layout: fixed; }
.cal th { font-size: .72rem; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); font-weight: 650; padding-bottom: 6px; }
.cal td { text-align: center; padding: 0; }
.cal .day { display: grid; place-items: center; aspect-ratio: 1; max-width: 52px; margin: 0 auto; border-radius: 50%; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--line-strong); text-decoration: none; position: relative; }
.cal a.day { color: var(--accent-ink); background: var(--accent-soft); font-weight: 750; transition: transform .12s, background .12s; }
.cal a.day:hover { transform: scale(1.06); background: color-mix(in oklab, var(--accent) 24%, transparent); }
.cal a.day[aria-current] { background: var(--accent); color: var(--on-accent); box-shadow: 0 6px 16px -6px var(--accent); }
.cal .day.today::after { content: ""; position: absolute; bottom: 5px; width: 4px; height: 4px; border-radius: 50%; background: currentColor; }
.tz { margin-top: 18px; display: flex; gap: 8px; align-items: center; color: var(--muted); font-size: .88rem; }
.tz select { width: auto; max-width: 100%; padding: 6px 8px; font-size: .88rem; border-color: var(--line); }

.times h3 { font-size: 1rem; margin-bottom: 14px; }
.times ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; max-height: 470px; overflow: auto; padding-right: 4px; }
.slot { display: flex; gap: 8px; }
.slot a.time { flex: 1; display: block; text-align: center; padding: 12px 10px; border: 1px solid color-mix(in oklab, var(--accent) 45%, var(--line)); color: var(--accent-ink); border-radius: 12px; font-weight: 700; text-decoration: none; font-variant-numeric: tabular-nums; transition: all .15s; }
.slot a.time:hover { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
.slot a.next { display: none; flex: 1; text-align: center; padding: 12px 10px; border-radius: 12px; background: var(--accent); color: var(--on-accent); font-weight: 700; text-decoration: none; }
.slot.picked a.time { flex: .9; background: var(--ink); color: var(--bg); border-color: var(--ink); }
.slot.picked a.next { display: block; animation: grow .18s ease-out; }
@keyframes grow { from { opacity: 0; transform: translateX(-6px); } }
.times .none { color: var(--muted); padding: 18px 0; }

@media (max-width: 1020px) {
  .booker, .booker.two { grid-template-columns: 1fr; }
  .booker > section + section { border-left: 0; border-top: 1px solid var(--line); }
  .times ol { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); max-height: none; }
  /* The picked time takes the whole row, with Next beside it. */
  .slot.picked { grid-column: 1 / -1; }
}
@media (max-width: 520px) { .booker > section { padding: 22px 18px; } .steps li span.word { display: none; } .steps li.current span.word { display: inline; } }

.details-form { max-width: 560px; }
.details-form .field .error { color: var(--bad); font-size: .85rem; font-weight: 600; }
.details-form input[aria-invalid=true] { border-color: var(--bad); }

/* Confirmation */
.done-page { max-width: 640px; margin: 0 auto; padding: 56px 0 80px; text-align: center; }
.seal { width: 88px; height: 88px; border-radius: 50%; background: var(--accent); color: var(--on-accent); display: grid; place-items: center; margin: 0 auto 22px; box-shadow: 0 0 0 10px var(--accent-soft); }
.seal .icon { width: 42px; height: 42px; stroke-width: 2.6; }
.seal.pop { animation: pop .5s cubic-bezier(.2,1.4,.4,1); }
.seal.off { background: var(--surface-2); color: var(--muted); box-shadow: 0 0 0 10px color-mix(in oklab, var(--line) 50%, transparent); }
@keyframes pop { from { transform: scale(.4); opacity: 0; } }
.ticket { text-align: left; background: var(--surface); border: 1px solid var(--line); border-radius: 20px; box-shadow: var(--shadow); margin: 28px 0 22px; overflow: hidden; }
.ticket header { padding: 22px 26px; border-bottom: 1px dashed var(--line-strong); }
.ticket header h2 { margin: 0; font-size: 1.3rem; }
.ticket header .when { font-size: 1.1rem; font-weight: 650; color: var(--accent-ink); margin-top: 4px; }
.ticket dl { margin: 0; padding: 18px 26px 22px; display: grid; grid-template-columns: auto 1fr; gap: 10px 22px; }
.ticket dt { color: var(--muted); font-weight: 550; }
.ticket dd { margin: 0; font-weight: 600; }
.addcal { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-bottom: 28px; }
.manage { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
.cancelled .ticket header .when { color: var(--muted); text-decoration: line-through; }

/* ---- Staff side ---- */
.page-head { padding: 40px 0 22px; }
.page-head h1 { font-size: clamp(1.9rem, 4vw, 2.6rem); margin: 0; }
.stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-bottom: 26px; }
.stat { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 16px 20px; }
.stat b { display: block; font-size: 1.8rem; line-height: 1.1; font-variant-numeric: tabular-nums; }
.stat span { color: var(--muted); font-size: .88rem; font-weight: 550; }
.sched { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 36px; padding-bottom: 80px; align-items: start; }
.sched aside { position: sticky; top: 88px; display: grid; gap: 18px; }
.sched aside .panel { padding: 18px; }
.sched .cal .day { max-width: 36px; font-size: .85rem; color: var(--muted); font-weight: 550; }
.sched .cal a.day { background: transparent; color: var(--ink); font-weight: 600; }
.sched .cal a.day:hover { background: var(--surface-2); transform: none; }
.sched .cal a.day.has::before { content: ""; position: absolute; top: 4px; right: 4px; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }
.sched .cal a.day[aria-current] { background: var(--accent); color: var(--on-accent); box-shadow: none; }
.sched .cal a.day.out { color: var(--line-strong); }
@media (max-width: 900px) { .sched { grid-template-columns: 1fr; } .sched aside { position: static; } .stats { grid-template-columns: 1fr 1fr 1fr; } .stat { padding: 12px 14px; } .stat b { font-size: 1.4rem; } }
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.chip { display: inline-flex; gap: 6px; align-items: center; padding: 6px 12px 6px 6px; border-radius: 99px; border: 1px solid var(--line); text-decoration: none; font-weight: 600; font-size: .85rem; background: var(--surface); }
.chip .face { width: 22px; height: 22px; font-size: .62rem; border: 0; }
.chip[aria-current] { border-color: var(--accent); background: var(--accent-soft); }
.chip.plain { padding-left: 12px; }

.day-block { margin-bottom: 30px; }
.day-block > h2 { font-size: 1.05rem; display: flex; gap: 10px; align-items: baseline; margin-bottom: 12px; }
.day-block > h2 small { color: var(--muted); font-weight: 550; font-size: .85rem; }
.day-block > h2 .badge { align-self: center; }
.icon-btn { display: inline-grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; border: 1px solid transparent; background: transparent; color: var(--ink); cursor: pointer; text-decoration: none; transition: background .15s, border-color .15s; }
.icon-btn:hover:not([disabled]):not(span) { background: var(--surface-2); border-color: var(--line); }
.icon-btn[disabled] { opacity: .3; cursor: default; }
.crumbs { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-weight: 600; font-size: .9rem; text-decoration: none; margin-bottom: 6px; }
.crumbs:hover { color: var(--ink); }
form.inline { display: inline; margin: 0; }
.copyfield { display: flex; gap: 8px; }
.copyfield input { flex: 1; min-width: 0; font-size: .85rem; }
.copyfield .btn { flex: none; }
.agenda { list-style: none; margin: 0; padding: 0; position: relative; }
.agenda li { position: relative; display: grid; grid-template-columns: 74px 22px minmax(0, 1fr); align-items: center; gap: 0 10px; padding: 5px 0; }
.agenda li::before { content: ""; position: absolute; left: 95px; top: 0; bottom: 0; width: 2px; background: var(--line); }
.agenda li:first-child::before { top: 50%; }
.agenda li:last-child::before { bottom: 50%; }
.agenda li:only-child::before { display: none; }
.agenda li.past::before { background: var(--accent); }
.agenda .t { text-align: right; white-space: nowrap; font-weight: 650; font-variant-numeric: tabular-nums; font-size: .92rem; }
.agenda .t small { display: block; color: var(--muted); font-weight: 500; font-size: .78rem; }
.agenda .pin { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--line-strong); background: var(--surface); justify-self: center; position: relative; z-index: 1; }
.agenda li.past .pin { background: var(--accent); border-color: var(--accent); }
.agenda li.now .pin { width: 20px; height: 20px; background: var(--accent); border-color: var(--accent); box-shadow: 0 0 0 6px var(--accent-soft); animation: pulse 2.4s ease-in-out infinite; }
.agenda .card { display: flex; gap: 14px; align-items: center; justify-content: space-between; padding: 12px 16px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); text-decoration: none; transition: box-shadow .15s, transform .25s cubic-bezier(.2,.8,.2,1), border-color .15s; }
.agenda .card:hover { box-shadow: var(--shadow); border-color: var(--line-strong); }
.agenda li.now .card { box-shadow: 0 0 0 2px var(--accent), var(--shadow); transform: translateX(6px); }
.agenda .card b { display: block; }
.agenda .card .sub { color: var(--muted); font-size: .88rem; }
.agenda li.cancelled .card { opacity: .55; }
.agenda li.cancelled .card b { text-decoration: line-through; }
.agenda li.gap .card { border-style: dashed; background: transparent; color: var(--muted); font-size: .85rem; padding: 6px 14px; }
.agenda li.nowline { grid-template-columns: 74px 22px 1fr; }
.agenda li.nowline .t { color: var(--accent-ink); font-size: .78rem; text-transform: uppercase; letter-spacing: .06em; }
.agenda li.nowline hr { border: 0; height: 2px; background: var(--accent); margin: 0; }
.agenda li.nowline .pin { width: 10px; height: 10px; background: var(--accent); border: 0; }
@media (max-width: 560px) { .agenda li, .agenda li.nowline { grid-template-columns: 62px 18px minmax(0, 1fr); gap: 0 6px; } .agenda li::before { left: 76px; } .agenda .t { font-size: .82rem; white-space: nowrap; } .agenda .card { flex-direction: column; align-items: flex-start; gap: 6px; } }

.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; padding-bottom: 80px; }
.card-link { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 22px; text-decoration: none; display: flex; flex-direction: column; gap: 10px; transition: transform .15s, box-shadow .15s; }
.card-link:hover { transform: translateY(-2px); box-shadow: var(--shadow); }
.card-link h2 { font-size: 1.2rem; margin: 0; }
.card-link.off { opacity: .6; }
.week { display: grid; gap: 10px; }
.week-row { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 14px; align-items: start; padding: 10px 0; border-bottom: 1px solid var(--line); }
.week-row:last-child { border-bottom: 0; }
.week-row .dayname { font-weight: 650; padding-top: 9px; }
.shifts { display: grid; gap: 8px; }
.shift { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.shift input[type=time] { width: 130px; font: inherit; font-size: .95rem; color: var(--ink); background: var(--surface); border: 1px solid var(--line-strong); border-radius: 10px; padding: 8px 10px; }
.hours-summary { display: grid; grid-template-columns: auto 1fr; gap: 2px 14px; font-size: .88rem; color: var(--muted); }
.hours-summary b { color: var(--ink); font-weight: 600; }
.split { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 28px; padding-bottom: 80px; align-items: start; }
@media (max-width: 900px) { .split { grid-template-columns: 1fr; } }
.kv { display: grid; grid-template-columns: auto 1fr; gap: 8px 18px; margin: 0; }
.kv dt { color: var(--muted); }
.kv dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
.list { list-style: none; padding: 0; margin: 0; display: grid; }
.list li { display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--line); }
.list li:last-child { border-bottom: 0; }
.status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--good); margin-right: 6px; }
.status-dot.bad { background: var(--bad); }
.status-dot.off { background: var(--line-strong); }
.badge.demo { background: color-mix(in oklab, #6c7ce0 18%, transparent); color: #4f5fc4; }

/* Demo */
.demo-bar { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 40; display: flex; gap: 12px; align-items: center; background: var(--ink); color: var(--bg); padding: 8px 8px 8px 18px; border-radius: 99px; box-shadow: 0 12px 32px -8px rgb(0 0 0 / .4); font-weight: 600; font-size: .9rem; white-space: nowrap; }
.demo-bar form { margin: 0; }
.demo-bar .btn { padding: 8px 14px; border-radius: 99px; }
.demo-bar a { color: inherit; }
body.has-demo-bar { padding-bottom: 80px; }
`;
