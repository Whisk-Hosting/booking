import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import { isColour, type Settings } from "../model.js";
import { icon } from "./icons.js";

export type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

export type StaffNav = "schedule" | "services" | "team" | "settings";

export type Page = {
  s: Settings;
  title: string;
  body: Html;
  // The staff header and its current page; absent on the public booking pages.
  staff?: { nav?: StaffNav; admin: boolean; email: string };
  // Anything demo mode adds (the Look around bar).
  extra?: Html;
};

const current = (on: boolean) => (on ? raw(' aria-current="page"') : "");

export const ASSET_VERSION = "3";

export const layout = ({ s, title, body, staff, extra }: Page) => {
  const accent = isColour(s.accent) ? s.accent : "#e85d2a";
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title === s.business_name ? title : `${title} · ${s.business_name}`}</title>
<link rel="preload" href="/assets/fonts/figtree-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/app.css?v=${ASSET_VERSION}">
<style>:root { --accent: ${raw(accent)}; }</style>
<meta name="theme-color" content="${accent}">
<link rel="icon" href="data:image/svg+xml,${raw(encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="${accent}"/></svg>`))}">
<script src="/assets/app.js?v=${ASSET_VERSION}" defer></script>
</head>
<body${extra ? raw(' class="has-demo-bar"') : ""}>
<header class="site-header">
  <div class="wrap">
    <a class="brand" href="${staff ? "/schedule" : "/"}"><span class="brand-dot"></span><span class="brand-name">${s.business_name}</span></a>
    ${staff
      ? html`<nav class="nav" aria-label="Main">
      <a href="/schedule"${current(staff.nav === "schedule")}>${icon.calendar}<span class="label">Schedule</span></a>
      ${staff.admin
        ? html`<a href="/services"${current(staff.nav === "services")}>${icon.list}<span class="label">Services</span></a>
      <a href="/team"${current(staff.nav === "team")}>${icon.people}<span class="label">Team</span></a>
      <a href="/settings"${current(staff.nav === "settings")}>${icon.settings}<span class="label">Settings</span></a>`
        : ""}
      <a href="/" title="Booking page">${icon.external}<span class="label">Booking page</span></a>
    </nav>`
      : ""}
  </div>
</header>
<main>${body}</main>
<footer class="site"><div class="wrap spread"><span>${s.business_name}</span><span>${staff ? html`<a href="/.whisk/logout?return=/">Sign out</a> · ` : html`<a href="/schedule">Staff</a> · `}Runs on <a href="https://whisk.run">Whisk</a></span></div></footer>
${extra ?? ""}
</body>
</html>`;
};

export const notice = (kind: "good" | "error" | "", text?: string) => (text ? html`<div class="notice ${kind}" role="status">${text}</div>` : "");

export const message = (title: string, body: string, link?: { href: string; label: string }) =>
  html`<div class="wrap"><div class="done-page"><div class="seal off">${icon.calendar}</div><h1>${title}</h1><p class="muted">${body}</p>${link ? html`<p><a class="btn" href="${link.href}">${link.label}</a></p>` : ""}</div></div>`;
