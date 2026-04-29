// Shipment tracking dashboard — pure client-side.
// Loads data/shipments.json and renders a filterable, searchable table.

const STATUS_LABEL = {
  delivered: "已妥投",
  in_transit: "在途",
  exception: "异常",
};

// Carrier → tracking URL template. Keep in sync with constants.py#TRACKING_URLS.
// Matching is case-insensitive so "FedEx", "fedex", "FEDEX" all work.
const TRACKING_URL_TEMPLATES = {
  fedex: "https://www.fedex.com/fedextrack/?trknbr={tn}",
  dhl: "https://www.dhl.com/global-en/home/tracking.html?tracking-id={tn}",
  ups: "https://www.ups.com/track?tracknum={tn}",
};

function trackingUrl(carrier, trackingNumber) {
  if (!carrier || !trackingNumber) return "";
  const tpl = TRACKING_URL_TEMPLATES[String(carrier).toLowerCase()];
  if (!tpl) return "";
  return tpl.replace("{tn}", encodeURIComponent(trackingNumber));
}

const STATUS_PILL_CLASS = {
  delivered: "pill pill-delivered",
  in_transit: "pill pill-in-transit",
  exception: "pill pill-exception",
};

const state = {
  data: { shipments: [], last_sync: null },
  filters: {
    search: "",
    salesperson: "",
    status: "",
    // 默认隐藏已签收：用户视角是"还没解决的单才需要看"。
    // 点"已妥投"或"全部"卡片时切到 true，让已签收也显示出来（带划线样式）。
    showDelivered: false,
  },
};

async function loadData() {
  try {
    // Cache-bust so fresh pushes show up without hard reload
    const res = await fetch(`data/shipments.json?t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.data = await res.json();
  } catch (err) {
    console.error("加载 shipments.json 失败:", err);
    state.data = { shipments: [], last_sync: null, error: err.message };
  }
  populateSalespeople();
  render();
}

function populateSalespeople() {
  const select = document.getElementById("filter-salesperson");
  const names = new Set();
  for (const s of state.data.shipments) {
    if (s.salesperson && s.salesperson.trim()) names.add(s.salesperson);
  }
  // keep existing "全部业务员" option, clear the rest
  select.innerHTML = '<option value="">全部业务员</option>';
  for (const name of [...names].sort()) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  }
}

function applyFilters(rows) {
  const q = state.filters.search.trim().toLowerCase();
  const sp = state.filters.salesperson;
  const st = state.filters.status;
  const showDelivered = state.filters.showDelivered;
  return rows.filter((r) => {
    if (sp && r.salesperson !== sp) return false;
    if (st && r.current_status !== st) return false;
    // 没有显式选 status 时，默认排除已签收（除非用户点了"全部"或"已妥投"）
    if (!st && !showDelivered && r.current_status === "delivered") return false;
    if (q) {
      const hay = [
        r.order_id,
        r.tracking_number,
        r.carrier,
        r.salesperson,
        r.latest_status_text,
        r.exception_subtype,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function render() {
  const rows = state.data.shipments || [];
  const filtered = applyFilters(rows);

  // Stats reflect *all* data (not filtered), so users see totals at a glance
  document.getElementById("stat-all").textContent = rows.length;
  document.getElementById("stat-delivered").textContent = rows.filter(
    (r) => r.current_status === "delivered"
  ).length;
  document.getElementById("stat-in-transit").textContent = rows.filter(
    (r) => r.current_status === "in_transit"
  ).length;
  document.getElementById("stat-exception").textContent = rows.filter(
    (r) => r.current_status === "exception"
  ).length;

  // Table body
  const tbody = document.getElementById("shipments-body");
  tbody.innerHTML = "";
  const empty = document.getElementById("empty-state");
  if (filtered.length === 0) {
    empty.hidden = false;
  } else {
    empty.hidden = true;
    for (const r of filtered) {
      const tr = document.createElement("tr");
      tr.dataset.orderId = r.order_id;
      // 行级状态 class：异常红底，已签收灰色划线
      if (r.current_status === "exception") tr.classList.add("row-exception");
      else if (r.current_status === "delivered") tr.classList.add("row-delivered");
      const url = trackingUrl(r.carrier, r.tracking_number);
      const trackingCell = url
        ? `<a class="tracking-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(r.tracking_number || "")}</a>`
        : escapeHtml(r.tracking_number || "");
      tr.innerHTML = `
        <td class="mono">${escapeHtml(r.order_id || "")}</td>
        <td>${escapeHtml(r.salesperson || "未指定")}</td>
        <td>${escapeHtml(r.carrier || "")}</td>
        <td class="mono">${trackingCell}</td>
        <td>${statusPill(r)}</td>
        <td>${escapeHtml(truncate(r.latest_status_text || "", 60))}</td>
        <td class="mono">${escapeHtml(r.latest_update_time || "")}</td>
        <td class="mono">${escapeHtml(r.delivered_time || "")}</td>
      `;
      tr.addEventListener("click", (e) => {
        // Let clicks on the tracking link fall through to the carrier site
        // without also opening the row detail modal.
        if (e.target.closest("a")) return;
        openDetail(r);
      });
      tbody.appendChild(tr);
    }
  }

  // Subtitle + footer sync time
  const sub = document.getElementById("subtitle");
  const total = rows.length;
  const shown = filtered.length;
  sub.textContent =
    shown === total
      ? `共 ${total} 条记录`
      : `共 ${total} 条记录，当前显示 ${shown} 条`;

  const footer = document.getElementById("last-sync");
  footer.textContent = state.data.last_sync
    ? `上次同步：${state.data.last_sync}`
    : "尚未同步";

  // Highlight active stat card based on status filter
  document.querySelectorAll(".stat-card").forEach((card) => {
    const f = card.dataset.filter;
    const active =
      (f === "all" && !state.filters.status) ||
      f === state.filters.status;
    card.classList.toggle("active", active);
  });
}

function statusPill(r) {
  const key = r.current_status;
  const label =
    key === "exception" && r.exception_subtype
      ? `${STATUS_LABEL[key]}·${r.exception_subtype}`
      : STATUS_LABEL[key] || key || "—";
  const cls = STATUS_PILL_CLASS[key] || "pill";
  return `<span class="${cls}">${escapeHtml(label)}</span>`;
}

function openDetail(r) {
  document.getElementById("detail-title").textContent = `订单 ${r.order_id}`;
  const meta = document.getElementById("detail-meta");
  const url = trackingUrl(r.carrier, r.tracking_number);
  // Sentinel object: the renderer below treats {raw: "..."} as pre-escaped HTML.
  const trackingValue = url && r.tracking_number
    ? { raw: `<a class="tracking-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(r.tracking_number)}</a>` }
    : (r.tracking_number || "");
  const rows = [
    ["业务员", r.salesperson || "未指定"],
    ["快递", r.carrier || ""],
    ["快递单号", trackingValue],
    ["发货时间", r.shipped_time || ""],
    ["当前状态", STATUS_LABEL[r.current_status] || r.current_status || ""],
    ["异常子类型", r.exception_subtype || ""],
    ["最新描述", r.latest_status_text || ""],
    ["最新更新", r.latest_update_time || ""],
    ["签收时间", r.delivered_time || ""],
    ["最后查询", r.last_checked_at || ""],
  ];
  meta.innerHTML = rows
    .filter(([, v]) => v)
    .map(([k, v]) => {
      const valueHtml =
        v && typeof v === "object" && "raw" in v ? v.raw : escapeHtml(String(v));
      return `<dt>${escapeHtml(k)}</dt><dd>${valueHtml}</dd>`;
    })
    .join("");

  const tl = document.getElementById("detail-timeline");
  tl.innerHTML = "";
  const history = (r.history || []).slice().reverse(); // newest first
  if (history.length === 0) {
    tl.innerHTML = '<li style="padding-left:0;border:none">暂无历史记录</li>';
  } else {
    for (const h of history) {
      const li = document.createElement("li");
      li.innerHTML = `
        <span class="timeline-time">${escapeHtml(h.time || "")}</span>
        <strong>${escapeHtml(
          STATUS_LABEL[h.status] || h.status || ""
        )}</strong>
        ${h.description ? " — " + escapeHtml(h.description) : ""}
      `;
      tl.appendChild(li);
    }
  }

  document.getElementById("detail-modal").hidden = false;
}

function closeDetail() {
  document.getElementById("detail-modal").hidden = true;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// --- Wire up UI ---
document.getElementById("search").addEventListener("input", (e) => {
  state.filters.search = e.target.value;
  render();
});

document.getElementById("filter-salesperson").addEventListener("change", (e) => {
  state.filters.salesperson = e.target.value;
  render();
});

document.getElementById("filter-status").addEventListener("change", (e) => {
  state.filters.status = e.target.value;
  // 用户主动选"已妥投"或"全部状态"时，已签收行应该显示；选其他则隐藏。
  state.filters.showDelivered =
    state.filters.status === "" || state.filters.status === "delivered";
  render();
});

document.getElementById("btn-reset").addEventListener("click", () => {
  state.filters = {
    search: "",
    salesperson: "",
    status: "",
    showDelivered: false,
  };
  document.getElementById("search").value = "";
  document.getElementById("filter-salesperson").value = "";
  document.getElementById("filter-status").value = "";
  render();
});

document.querySelectorAll(".stat-card").forEach((card) => {
  card.addEventListener("click", () => {
    const f = card.dataset.filter;
    state.filters.status = f === "all" ? "" : f;
    // 点"全部"或"已妥投"时，让已签收行也显示（含划线样式）；
    // 点"在途"/"异常"时回归默认隐藏。
    state.filters.showDelivered = f === "all" || f === "delivered";
    document.getElementById("filter-status").value = state.filters.status;
    render();
  });
});

document.querySelectorAll("[data-close]").forEach((el) => {
  el.addEventListener("click", closeDetail);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeDetail();
});

loadData();
