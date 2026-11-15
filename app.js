function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return url.href;
  } catch (_) {
    /* ignore malformed urls */
  }
  return "";
}

function linkHtml(url, label) {
  const href = safeUrl(url);
  const text = escapeHtml(label || url);
  if (!href) return text;
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
}

function bareUrlLength(value, index) {
  if (!value.startsWith("http://", index) && !value.startsWith("https://", index)) return 0;
  let end = index;
  while (end < value.length && !/\s/.test(value[end]) && value[end] !== ")" && value[end] !== "]") end += 1;
  let url = value.slice(index, end);
  while (/[.,!?:;、。]/.test(url.slice(-1))) url = url.slice(0, -1);
  return url.length;
}

function renderInline(raw, allowBold) {
  if (allowBold === undefined) allowBold = true;
  let html = "";
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === "`") {
      const end = raw.indexOf("`", i + 1);
      if (end !== -1) {
        html += `<code>${escapeHtml(raw.slice(i + 1, end))}</code>`;
        i = end + 1;
        continue;
      }
    }
    if (allowBold && raw.startsWith("**", i)) {
      const end = raw.indexOf("**", i + 2);
      if (end !== -1) {
        html += `<strong>${renderInline(raw.slice(i + 2, end), false)}</strong>`;
        i = end + 2;
        continue;
      }
    }
    if (raw[i] === "[") {
      const match = /^\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/.exec(raw.slice(i));
      if (match) {
        html += linkHtml(match[2], match[1] || match[2]);
        i += match[0].length;
        continue;
      }
    }
    const urlLength = bareUrlLength(raw, i);
    if (urlLength) {
      const url = raw.slice(i, i + urlLength);
      html += linkHtml(url, url);
      i += urlLength;
      continue;
    }
    let j = i + 1;
    while (j < raw.length) {
      const ch = raw[j];
      if (
        ch === "`" ||
        ch === "[" ||
        (allowBold && raw.startsWith("**", j)) ||
        raw.startsWith("http://", j) ||
        raw.startsWith("https://", j)
      ) break;
      j += 1;
    }
    html += escapeHtml(raw.slice(i, j));
    i = j;
  }
  return html;
}

function renderList(items) {
  function build(start, indent) {
    const ordered = items[start].ordered;
    const tag = ordered ? "ol" : "ul";
    const startAttr = ordered && items[start].num > 1 ? ` start="${items[start].num}"` : "";
    let html = `<${tag}${startAttr}>`;
    let i = start;
    while (i < items.length && items[i].indent >= indent) {
      if (items[i].indent === indent && items[i].ordered !== ordered) break;
      if (items[i].indent > indent) {
        i += 1;
        continue;
      }
      html += `<li>${renderInline(items[i].text)}`;
      if (i + 1 < items.length && items[i + 1].indent > indent) {
        const nested = build(i + 1, items[i + 1].indent);
        html += nested.html;
        i = nested.next;
      } else {
        i += 1;
      }
      html += "</li>";
    }
    html += `</${tag}>`;
    return { html, next: i };
  }

  let html = "";
  let i = 0;
  while (i < items.length) {
    const built = build(i, items[i].indent);
    html += built.html;
    if (built.next <= i) break;
    i = built.next;
  }
  return html;
}

function renderBlocks(src) {
  const lines = String(src).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  let html = "";
  let paragraph = [];
  let list = [];

  function flushParagraph() {
    if (!paragraph.length) return;
    html += `<p>${paragraph.map((line) => renderInline(line)).join("<br>")}</p>`;
    paragraph = [];
  }

  function flushList() {
    if (!list.length) return;
    html += renderList(list);
    list = [];
  }

  for (const line of lines) {
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    if (line.startsWith("#")) {
      const heading = /^(#+)\s*(.*?)\s*$/.exec(line);
      if (heading && heading[2]) {
        flushParagraph();
        flushList();
        html += `<h3>${renderInline(heading[2])}</h3>`;
        continue;
      }
    }
    const item = /^(\s*)(?:[-*]|(\d+)\.)\s+(.+)$/.exec(line);
    if (item) {
      flushParagraph();
      list.push({
        indent: item[1].length,
        ordered: Boolean(item[2]),
        num: item[2] ? Number(item[2]) : 0,
        text: item[3]
      });
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return html;
}

function formatJst(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const get = (type) => (parts.find((part) => part.type === type) || {}).value || "";
  const hour = get("hour");
  return `${get("year")}/${get("month")}/${get("day")} ${hour === "24" ? "00" : hour}:${get("minute")}`;
}

function postUrl(post) {
  if (post.url) return post.url;
  if (post.tweetId) return `https://x.com/i/web/status/${post.tweetId}`;
  return "";
}

function hasDetail(post) {
  if (post.summary && post.summary.trim()) return true;
  if (post.deepDive && post.deepDive.trim()) return true;
  return (post.followUps || []).some((item) => (item.title || "").trim() || (item.text || "").trim());
}

function extraHtml(post) {
  let html = "";
  if (post.summary && post.summary.trim()) {
    html += `<p class="summary">${escapeHtml(post.summary.trim())}</p>`;
  }
  if (post.deepDive && post.deepDive.trim()) {
    html += `<div class="dive">${renderBlocks(post.deepDive.trim())}</div>`;
  }
  for (const item of post.followUps || []) {
    const title = (item.title || "").trim();
    const text = (item.text || "").trim();
    const when = formatJst(item.datetime) || item.clock || "";
    if (!title && !text) continue;
    html += '<section class="follow">';
    if (when) html += `<p class="when">${escapeHtml(when)}</p>`;
    if (title) html += `<p class="follow-title">${escapeHtml(title)}</p>`;
    if (text) html += renderBlocks(text);
    html += "</section>";
  }
  return html;
}

function mediaHtml(images) {
  const shots = (images || []).filter((image) => image && safeUrl(image.url)).slice(0, 4);
  if (!shots.length) return "";
  const html = shots.map((image) => {
    const href = safeUrl(image.url);
    const video = image.type === "video_preview";
    return `<a class="shot${video ? " video" : ""}" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(href)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">${video ? '<span class="play" aria-hidden="true"></span>' : ""}</a>`;
  }).join("");
  return `<div class="media n${shots.length}">${html}</div>`;
}

function createCard(post, users) {
  const author = post.author || {};
  const handle = author.handle || "";
  const user = handle ? users.get(handle) : null;
  const name = author.name || (user && user.name) || "";
  const avatarUrl = (user && user.avatarUrl) || "";
  const when = formatJst(post.postedAt || post.datetime);
  const href = safeUrl(postUrl(post));
  const source = post.source === "likes" || post.source === "timeline" ? post.source : "";
  const rawText = (post.text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const bodyHtml = rawText
    ? renderInline(rawText).replace(/\n/g, "<br>")
    : (post.title ? escapeHtml(post.title) : "");
  const expandable = hasDetail(post);
  const article = document.createElement("article");
  article.className = "post" + (expandable ? " expandable" : "") + (name || handle ? "" : " anon");
  if (expandable) {
    article.tabIndex = 0;
    article.setAttribute("aria-expanded", "false");
  }
  article._post = post;

  const initial = [...(name || handle || "?")][0];
  let avatarHtml = "";
  if (name || handle) {
    avatarHtml = avatarUrl
      ? `<img class="avatar" src="${escapeHtml(avatarUrl)}" alt="" referrerpolicy="no-referrer" decoding="async">`
      : `<span class="avatar fallback" aria-hidden="true">${escapeHtml(initial)}</span>`;
  }
  const timeHtml = when
    ? (href
      ? `<a class="time" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(when)}</a>`
      : `<time class="time">${escapeHtml(when)}</time>`)
    : "";
  const srcHtml = source
    ? `<span class="src ${source}">${source === "likes" ? "いいね" : "タイムライン"}</span>`
    : "";

  article.innerHTML = `<div class="row">${avatarHtml}<div class="maincol"><div class="meta">${name ? `<span class="name">${escapeHtml(name)}</span>` : ""}${handle ? `<span class="handle">@${escapeHtml(handle)}</span>` : ""}${timeHtml}${srcHtml}</div>${bodyHtml ? `<div class="text">${bodyHtml}</div>` : ""}${mediaHtml(post.images)}${expandable ? '<div class="extra" hidden></div>' : ""}</div></div>`;

  const avatar = article.querySelector("img.avatar");
  if (avatar) {
    avatar.addEventListener("error", () => {
      const span = document.createElement("span");
      span.className = "avatar fallback";
      span.setAttribute("aria-hidden", "true");
      span.textContent = initial;
      avatar.replaceWith(span);
    });
  }
  article.querySelectorAll(".shot img").forEach((img) => {
    img.addEventListener("error", () => {
      const link = img.closest("a");
      if (!link || link.dataset.failed) return;
      link.dataset.failed = "1";
      link.classList.add("failed");
      link.textContent = link.getAttribute("href") || "";
    });
  });
  return article;
}

function searchHay(post) {
  const author = post.author || {};
  const parts = [
    author.name || "",
    author.handle || "",
    author.handle ? `@${author.handle}` : "",
    post.text || "",
    post.title || "",
    post.summary || "",
    post.deepDive || ""
  ];
  for (const item of post.followUps || []) {
    parts.push(item.title || "", item.text || "");
  }
  return parts.join("\n").toLowerCase();
}

function toggle(article) {
  const extra = article.querySelector(".extra");
  if (!extra) return;
  const open = !article.classList.contains("open");
  if (open && !extra.dataset.ready) {
    extra.innerHTML = extraHtml(article._post);
    extra.dataset.ready = "1";
  }
  article.classList.toggle("open", open);
  article.setAttribute("aria-expanded", open ? "true" : "false");
  extra.hidden = !open;
}

async function main() {
  const feed = document.getElementById("feed");
  const empty = document.getElementById("empty");
  const error = document.getElementById("error");
  const input = document.getElementById("q");
  let posts;
  let users;
  try {
    const [postsRes, usersRes] = await Promise.all([
      fetch("data/posts.json"),
      fetch("data/users.json")
    ]);
    if (!postsRes.ok || !usersRes.ok) throw new Error("load failed");
    posts = await postsRes.json();
    users = await usersRes.json();
  } catch (_) {
    error.hidden = false;
    return;
  }

  const userMap = new Map((users || []).map((user) => [user.handle, user]));
  const items = (posts || []).slice().sort((a, b) => {
    const left = a.postedAt || a.datetime || "";
    const right = b.postedAt || b.datetime || "";
    if (left === right) return 0;
    return left < right ? 1 : -1;
  });

  const cards = items.map((post) => {
    const el = createCard(post, userMap);
    return { el, hay: searchHay(post) };
  });
  const fragment = document.createDocumentFragment();
  cards.forEach((card) => fragment.appendChild(card.el));
  feed.appendChild(fragment);

  function applyFilter() {
    const terms = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const card of cards) {
      const ok = terms.every((term) => card.hay.includes(term));
      card.el.hidden = !ok;
      if (ok) shown += 1;
    }
    empty.hidden = shown !== 0;
  }

  input.addEventListener("input", applyFilter);

  let pointer = null;
  feed.addEventListener("pointerdown", (event) => {
    pointer = { x: event.clientX, y: event.clientY };
  });
  feed.addEventListener("click", (event) => {
    if (event.target.closest("a")) return;
    if (pointer && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 6) return;
    const article = event.target.closest(".post.expandable");
    if (!article || !feed.contains(article)) return;
    toggle(article);
  });
  feed.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const article = event.target.closest(".post.expandable");
    if (!article || event.target !== article) return;
    event.preventDefault();
    toggle(article);
  });
}

if (typeof document !== "undefined") main();
