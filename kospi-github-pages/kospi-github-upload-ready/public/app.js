const state = {
  data: [],
  latest: null,
  priceRange: "1Y",
  disparityRange: "1Y",
  strategies: {},
  editingZone: "cooled",
};

const zoneMeta = {
  cooled: { label: "과열해소", short: "≤105", min: 0, max: 105 },
  normal: { label: "정상", short: "105-120", min: 105, max: 120 },
  warning: { label: "경계", short: "120-130", min: 120, max: 130 },
  overheated: { label: "과열", short: "≥130", min: 130, max: Infinity },
};

const defaultStrategies = {
  cooled: {
    title: "과열 해소 후 회복 후보 점검",
    stance: "분할매수",
    checklist: [
      "코스피가 50일선 위로 회복하는지 확인",
      "낙폭이 컸지만 실적 전망이 유지되는 업종부터 선별",
      "하루에 전부 진입하지 말고 2-3회로 나눠 실행",
    ],
    memo: "투매 이후에는 가격보다 회복 순서를 봅니다. 지수 반등이 약하면 현금 비중을 유지합니다.",
  },
  normal: {
    title: "추세 추종 구간 유지",
    stance: "추세추종",
    checklist: [
      "보유 업종의 상대강도와 거래대금을 확인",
      "50일선 이탈 전까지 핵심 포지션 유지",
      "신규 진입은 눌림목과 손절 기준을 함께 설정",
    ],
    memo: "이 구간은 과열보다 추세 지속 여부가 더 중요합니다.",
  },
  warning: {
    title: "속도 조절과 일부 이익 실현",
    stance: "비중축소",
    checklist: [
      "단기 급등 종목의 목표 비중을 낮춤",
      "신규 추격매수는 중단하고 눌림을 기다림",
      "주도 업종이 바뀌는지 매일 확인",
    ],
    memo: "상승은 이어질 수 있지만 손익비가 나빠지기 쉬운 구간입니다.",
  },
  overheated: {
    title: "과열권 추격매수 금지",
    stance: "현금확대",
    checklist: [
      "신규 매수보다 보유 포지션 리스크를 먼저 점검",
      "분할 매도 또는 헤지 기준을 실행",
      "이격도 120 아래 재진입 전까지 후보군만 관리",
    ],
    memo: "강세가 더 이어져도 계획 없는 추격은 피합니다.",
  },
};

const els = {
  refreshButton: document.querySelector("#refreshButton"),
  statusDot: document.querySelector("#statusDot"),
  statusText: document.querySelector("#statusText"),
  currentDisparity: document.querySelector("#currentDisparity"),
  currentKospi: document.querySelector("#currentKospi"),
  currentMa: document.querySelector("#currentMa"),
  currentDate: document.querySelector("#currentDate"),
  gaugeFill: document.querySelector("#gaugeFill"),
  gaugePin: document.querySelector("#gaugePin"),
  priceChart: document.querySelector("#priceChart"),
  disparityChart: document.querySelector("#disparityChart"),
  priceChartCaption: document.querySelector("#priceChartCaption"),
  activeZoneBadge: document.querySelector("#activeZoneBadge"),
  activeStance: document.querySelector("#activeStance"),
  activeTitle: document.querySelector("#activeTitle"),
  activeChecklist: document.querySelector("#activeChecklist"),
  activeMemo: document.querySelector("#activeMemo"),
  conditionTabs: document.querySelector("#conditionTabs"),
  strategyForm: document.querySelector("#strategyForm"),
  strategyTitle: document.querySelector("#strategyTitle"),
  strategyStance: document.querySelector("#strategyStance"),
  strategyChecklist: document.querySelector("#strategyChecklist"),
  strategyMemo: document.querySelector("#strategyMemo"),
  resetStrategy: document.querySelector("#resetStrategy"),
  strategyList: document.querySelector("#strategyList"),
  historyBody: document.querySelector("#historyBody"),
  dataSource: document.querySelector("#dataSource"),
  toast: document.querySelector("#toast"),
};

function formatNumber(value, digits = 2) {
  if (value == null || Number.isNaN(value)) return "--";
  return new Intl.NumberFormat("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function getStorageKey() {
  return "kospi-ma-disparity-strategies-v1";
}

function loadStrategies() {
  try {
    const saved = JSON.parse(localStorage.getItem(getStorageKey()) || "{}");
    state.strategies = structuredClone(defaultStrategies);
    Object.keys(defaultStrategies).forEach((zone) => {
      if (saved[zone]) {
        state.strategies[zone] = {
          ...state.strategies[zone],
          ...saved[zone],
          checklist: Array.isArray(saved[zone].checklist)
            ? saved[zone].checklist
            : state.strategies[zone].checklist,
        };
      }
    });
  } catch {
    state.strategies = structuredClone(defaultStrategies);
  }
}

function saveStrategies() {
  localStorage.setItem(getStorageKey(), JSON.stringify(state.strategies));
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.classList.remove("show");
  }, 2400);
}

function zoneFor(disparity) {
  if (disparity >= 130) return "overheated";
  if (disparity >= 120) return "warning";
  if (disparity > 105) return "normal";
  return "cooled";
}

function setZoneClasses(element, zone) {
  element.classList.remove("cooled", "normal", "warning", "overheated");
  if (zone) element.classList.add(zone);
}

function setLoading(isLoading) {
  els.refreshButton.classList.toggle("loading", isLoading);
  els.refreshButton.disabled = isLoading;
}

function gaugePercent(disparity) {
  if (disparity == null) return 0;
  const clamped = Math.max(92, Math.min(140, disparity));
  return ((clamped - 92) / (140 - 92)) * 100;
}

function updateSummary() {
  const latest = state.latest;
  if (!latest) return;

  const zone = latest.zone || zoneFor(latest.disparity);
  const meta = zoneMeta[zone];
  const percent = gaugePercent(latest.disparity);

  els.statusText.textContent = `${meta.label} 구간`;
  setZoneClasses(els.statusDot, zone);
  els.currentDisparity.textContent = `${formatNumber(latest.disparity, 2)}%`;
  els.currentKospi.textContent = formatNumber(latest.close, 2);
  els.currentMa.textContent = formatNumber(latest.ma50, 2);
  els.currentDate.textContent = latest.date;
  els.gaugeFill.style.width = `${percent}%`;
  els.gaugePin.style.left = `${percent}%`;

  renderActiveStrategy();
}

function daysForRange(range) {
  return { "3M": 95, "6M": 190, "1Y": 380, "2Y": 760, "5Y": 1900 }[range] || 380;
}

function dataForRange(range) {
  return state.data.slice(-daysForRange(range));
}

function setupCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(640, Math.floor(rect.width * ratio));
  canvas.height = Math.max(260, Math.floor(rect.height * ratio));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return {
    ctx,
    width: canvas.width / ratio,
    height: canvas.height / ratio,
  };
}

function drawEmpty(canvas, message) {
  const { ctx, width, height } = setupCanvas(canvas);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#627069";
  ctx.font = "700 15px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(message, width / 2, height / 2);
}

function drawGrid(ctx, plot, ticks, labels) {
  ctx.strokeStyle = "#dce2dc";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#627069";
  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  ticks.forEach((tick, index) => {
    const y = plot.bottom - ((tick - plot.min) / (plot.max - plot.min)) * plot.height;
    ctx.beginPath();
    ctx.moveTo(plot.left, y);
    ctx.lineTo(plot.right, y);
    ctx.stroke();
    ctx.fillText(labels[index], plot.left - 8, y);
  });
}

function drawLine(ctx, points, plot, getValue, color, width = 2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();

  let started = false;
  points.forEach((point, index) => {
    const value = getValue(point);
    if (value == null) return;
    const x = plot.left + (index / Math.max(1, points.length - 1)) * plot.width;
    const y = plot.bottom - ((value - plot.min) / (plot.max - plot.min)) * plot.height;
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.stroke();
}

function niceTicks(min, max, count = 5) {
  const span = max - min || 1;
  const step = span / (count - 1);
  return Array.from({ length: count }, (_, index) => min + step * index);
}

function drawLegend(ctx, items, x, y) {
  ctx.font = "700 12px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  let cursor = x;
  items.forEach((item) => {
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cursor, y);
    ctx.lineTo(cursor + 22, y);
    ctx.stroke();
    ctx.fillStyle = "#24312b";
    ctx.fillText(item.label, cursor + 28, y);
    cursor += item.width;
  });
}

function drawPriceChart() {
  const points = dataForRange(state.priceRange);
  if (!points.length) {
    drawEmpty(els.priceChart, "가격 데이터를 기다리는 중입니다.");
    return;
  }

  const { ctx, width, height } = setupCanvas(els.priceChart);
  const plot = { left: 70, right: width - 18, top: 24, bottom: height - 38 };
  plot.width = plot.right - plot.left;
  plot.height = plot.bottom - plot.top;

  const values = points.flatMap((point) => [point.close, point.ma50]).filter(Boolean);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.12 || 100;
  plot.min = min - pad;
  plot.max = max + pad;

  ctx.clearRect(0, 0, width, height);
  drawGrid(
    ctx,
    plot,
    niceTicks(plot.min, plot.max),
    niceTicks(plot.min, plot.max).map((tick) => formatNumber(tick, 0))
  );
  drawLine(ctx, points, plot, (point) => point.close, "#2869b8", 2.4);
  drawLine(ctx, points, plot, (point) => point.ma50, "#1f8a5b", 2);

  ctx.fillStyle = "#627069";
  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(points[0].date, plot.left, height - 14);
  ctx.textAlign = "right";
  ctx.fillText(points.at(-1).date, plot.right, height - 14);
  drawLegend(ctx, [
    { label: "코스피", color: "#2869b8", width: 86 },
    { label: "50일선", color: "#1f8a5b", width: 92 },
  ], plot.left, 14);

  els.priceChartCaption.textContent = `${points[0].date}부터 ${points.at(-1).date}까지 표시`;
}

function drawThreshold(ctx, plot, value, label, color) {
  if (value < plot.min || value > plot.max) return;
  const y = plot.bottom - ((value - plot.min) / (plot.max - plot.min)) * plot.height;
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(plot.left, y);
  ctx.lineTo(plot.right, y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.font = "800 12px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(label, plot.right - 4, y - 8);
}

function drawDisparityChart() {
  const points = dataForRange(state.disparityRange);
  if (!points.length) {
    drawEmpty(els.disparityChart, "이격도 데이터를 기다리는 중입니다.");
    return;
  }

  const { ctx, width, height } = setupCanvas(els.disparityChart);
  const plot = { left: 64, right: width - 18, top: 24, bottom: height - 38 };
  plot.width = plot.right - plot.left;
  plot.height = plot.bottom - plot.top;

  const values = points.map((point) => point.disparity).filter(Boolean);
  const min = Math.min(100, ...values, 105);
  const max = Math.max(132, ...values, 130);
  const pad = (max - min) * 0.08;
  plot.min = min - pad;
  plot.max = max + pad;

  ctx.clearRect(0, 0, width, height);
  const ticks = niceTicks(plot.min, plot.max);
  drawGrid(ctx, plot, ticks, ticks.map((tick) => `${formatNumber(tick, 1)}%`));
  drawThreshold(ctx, plot, 105, "105", "#1f8a5b");
  drawThreshold(ctx, plot, 120, "120", "#b97812");
  drawThreshold(ctx, plot, 130, "130", "#bd3f35");
  drawLine(ctx, points, plot, (point) => point.disparity, "#24312b", 2.4);

  ctx.fillStyle = "#627069";
  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(points[0].date, plot.left, height - 14);
  ctx.textAlign = "right";
  ctx.fillText(points.at(-1).date, plot.right, height - 14);
}

function renderCharts() {
  drawPriceChart();
  drawDisparityChart();
}

function renderActiveStrategy() {
  const latest = state.latest;
  const zone = latest?.zone || "normal";
  const strategy = state.strategies[zone];
  const meta = zoneMeta[zone];

  els.activeZoneBadge.textContent = meta ? meta.label : "--";
  setZoneClasses(els.activeZoneBadge, zone);
  els.activeStance.textContent = strategy.stance;
  els.activeTitle.textContent = strategy.title;
  els.activeChecklist.innerHTML = strategy.checklist.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  els.activeMemo.textContent = strategy.memo;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fillStrategyForm(zone) {
  state.editingZone = zone;
  const strategy = state.strategies[zone];
  els.conditionTabs.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset.zone === zone);
  });
  els.strategyTitle.value = strategy.title;
  els.strategyStance.value = strategy.stance;
  els.strategyChecklist.value = strategy.checklist.join("\n");
  els.strategyMemo.value = strategy.memo;
}

function renderStrategyList() {
  els.strategyList.innerHTML = Object.keys(zoneMeta)
    .map((zone) => {
      const meta = zoneMeta[zone];
      const strategy = state.strategies[zone];
      const firstLine = strategy.checklist[0] || "";
      return `
        <article class="strategy-item">
          <span>${meta.label} ${meta.short}</span>
          <strong>${escapeHtml(strategy.title)}</strong>
          <p>${escapeHtml(strategy.stance)} · ${escapeHtml(firstLine)}</p>
          <button type="button" data-edit-zone="${zone}">수정</button>
        </article>
      `;
    })
    .join("");
}

function renderHistory() {
  const rows = state.data.slice(-12).reverse();
  els.historyBody.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>${row.date}</td>
          <td>${formatNumber(row.close, 2)}</td>
          <td>${formatNumber(row.ma50, 2)}</td>
          <td>${formatNumber(row.disparity, 2)}%</td>
          <td>${zoneMeta[row.zone]?.label || row.zoneLabel}</td>
        </tr>
      `
    )
    .join("");
}

function renderAll() {
  updateSummary();
  renderCharts();
  renderActiveStrategy();
  renderStrategyList();
  renderHistory();
}

async function loadKospi(refresh = false) {
  setLoading(true);
  try {
    const payload = await fetchKospiPayload(refresh);

    state.data = payload.points || [];
    state.latest = payload.latest || state.data.at(-1);
    const fetchedAt = payload.fetchedAt ? new Date(payload.fetchedAt).toLocaleString("ko-KR") : "--";
    els.dataSource.textContent = `${payload.source} · 갱신 ${fetchedAt}${payload.cached ? " · 캐시" : ""}`;
    renderAll();
  } catch (error) {
    els.statusText.textContent = "데이터 연결 실패";
    els.currentDisparity.textContent = "--%";
    els.dataSource.textContent = `외부 데이터를 불러오지 못했습니다. ${error.message}`;
    drawEmpty(els.priceChart, "외부 데이터 연결을 확인해 주세요.");
    drawEmpty(els.disparityChart, "외부 데이터 연결을 확인해 주세요.");
    showToast("코스피 데이터를 불러오지 못했습니다.");
  } finally {
    setLoading(false);
  }
}

async function fetchKospiPayload(refresh) {
  const cacheBust = `t=${Date.now()}`;
  const isLocalhost = ["localhost", "127.0.0.1", ""].includes(window.location.hostname);
  const candidates = isLocalhost
    ? [`/api/kospi${refresh ? "?refresh=1" : ""}`, `./data/kospi.json?${cacheBust}`]
    : [`./data/kospi.json?${cacheBust}`];

  let lastError = null;
  for (const url of candidates) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || payload.error || "데이터 오류");
      return payload;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("데이터 오류");
}

function bindEvents() {
  els.refreshButton.addEventListener("click", () => loadKospi(true));

  document.querySelectorAll(".range-control").forEach((control) => {
    control.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      const chart = control.dataset.chart;
      const range = button.dataset.range;
      control.querySelectorAll("button").forEach((item) => {
        item.classList.toggle("active", item === button);
      });
      if (chart === "price") state.priceRange = range;
      if (chart === "disparity") state.disparityRange = range;
      renderCharts();
    });
  });

  els.conditionTabs.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    fillStrategyForm(button.dataset.zone);
  });

  els.strategyForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const checklist = els.strategyChecklist.value
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);

    state.strategies[state.editingZone] = {
      title: els.strategyTitle.value.trim() || defaultStrategies[state.editingZone].title,
      stance: els.strategyStance.value,
      checklist: checklist.length ? checklist : defaultStrategies[state.editingZone].checklist,
      memo: els.strategyMemo.value.trim(),
    };

    saveStrategies();
    renderAll();
    showToast("전략을 저장했습니다.");
  });

  els.resetStrategy.addEventListener("click", () => {
    state.strategies[state.editingZone] = structuredClone(defaultStrategies[state.editingZone]);
    saveStrategies();
    fillStrategyForm(state.editingZone);
    renderAll();
    showToast("기본 전략으로 복원했습니다.");
  });

  els.strategyList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-zone]");
    if (!button) return;
    fillStrategyForm(button.dataset.editZone);
    document.querySelector(".strategy-editor").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  window.addEventListener("resize", () => {
    window.clearTimeout(bindEvents.resizeTimer);
    bindEvents.resizeTimer = window.setTimeout(renderCharts, 120);
  });
}

loadStrategies();
fillStrategyForm(state.editingZone);
bindEvents();
renderStrategyList();
loadKospi();
