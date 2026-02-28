// =============================================
// Instagram DM Cleaner — Content Script v4.2
// Hybrid: API for counting + DOM for deletion
// Worker runs in separate window, UI in main tab
// =============================================

const IS_WORKER = window.location.search.includes("dm_cleaner=worker");

console.log(`[DM Cleaner] Loaded (${IS_WORKER ? "WORKER" : "MAIN"} mode) v4.2`);

// ==========================================
//  SPEED PROFILES
// ==========================================
const SPEED_PROFILES = {
  slow: {
    afterDelete: [2500, 4000],
    pauseEvery: 8,
    pauseDuration: [6000, 12000],
  },
  normal: {
    afterDelete: [1000, 1800],
    pauseEvery: 12,
    pauseDuration: [4000, 7000],
  },
  fast: {
    afterDelete: [500, 900],
    pauseEvery: 15,
    pauseDuration: [3000, 5000],
  },
};

// ==========================================
//  SHARED UTILITIES
// ==========================================

function randomDelay(min = 500, max = 1000) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function delayFromProfile(profile, key) {
  const [min, max] = profile[key];
  return randomDelay(min, max);
}

async function getSpeedProfile() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(["dmCleanerSpeed"], (data) => {
        const speed = data?.dmCleanerSpeed || "normal";
        resolve(SPEED_PROFILES[speed] || SPEED_PROFILES.normal);
      });
    } catch (e) { resolve(SPEED_PROFILES.normal); }
  });
}

// ==========================================
//  BRIDGE: Talk to api_bridge.js (MAIN world)
//  via window.postMessage
// ==========================================

let _requestCounter = 0;
function pageApiCall(action, params = {}) {
  return new Promise((resolve) => {
    const requestId = "dmcleaner_" + (++_requestCounter) + "_" + Date.now();

    function onMessage(event) {
      if (event.source !== window) return;
      if (!event.data || event.data.type !== "DM_CLEANER_RESPONSE") return;
      if (event.data.requestId !== requestId) return;
      window.removeEventListener("message", onMessage);
      resolve(event.data);
    }

    window.addEventListener("message", onMessage);

    setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve({ success: false, error: "Timeout" });
    }, 15000);

    window.postMessage({
      type: "DM_CLEANER_REQUEST",
      requestId,
      action,
      ...params,
    }, "*");
  });
}

// Bridge wrapper functions
async function fetchInboxThreads(cursor = null) {
  const result = await pageApiCall("fetch_inbox", { cursor });
  if (!result.success) {
    console.error("[DM] Inbox fetch failed:", result.error);
    return null;
  }
  return result.data;
}

async function deleteTopChat() {
  const result = await pageApiCall("delete_top_chat");
  return result.success;
}

async function countVisibleChats() {
  const result = await pageApiCall("count_chats");
  return result.success ? result.count : 0;
}

// ==========================================
//  WORKER MODE
// ==========================================

if (IS_WORKER) {
  let isPaused = false;

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "pause") { isPaused = true; }
    if (msg.action === "resume") { isPaused = false; }
  });

  window.addEventListener("load", () => {
    console.log("[DM Worker] Page loaded, waiting before start...");
    setTimeout(() => runWorkerDeletion(), 3500);
  });

  async function runWorkerDeletion() {
    console.log("[DM Worker] Starting deletion (v4.2 Hybrid)...");

    try { const { dmCleanerCommand } = await chrome.storage.local.get(["dmCleanerCommand"]); if (dmCleanerCommand === "pause") isPaused = true; } catch (e) { }

    const profile = await getSpeedProfile();
    let deleted = 0;
    let failStreak = 0;

    // Get total count via API
    const data = await fetchInboxThreads();
    let total = data?.inbox?.threads?.length || 0;
    if (data?.inbox?.has_older) total = Math.max(total * 2, total + 10);

    // Fallback to DOM count
    if (total === 0) total = await countVisibleChats();

    if (total === 0) {
      sendProgress("done", 0, 0, "Silinecek sohbet bulunamadı!");
      return;
    }

    sendProgress("running", 0, total, `${total}+ sohbet bulundu. Siliniyor...`);

    while (true) {
      // Pause check
      while (isPaused) {
        sendProgress("paused", deleted, total, `⏸️ Duraklatıldı (${deleted}/${total})`);
        await randomDelay(500, 800);
        try { const { dmCleanerCommand: cmd } = await chrome.storage.local.get(["dmCleanerCommand"]); if (cmd === "resume" || cmd === "start") isPaused = false; } catch (e) { }
      }

      // Check remaining
      const remaining = await countVisibleChats();
      if (remaining === 0) {
        await randomDelay(1500, 2000);
        if (await countVisibleChats() === 0) break;
      }

      if (deleted + remaining > total) total = deleted + remaining;
      sendProgress("running", deleted, total, `Siliniyor... (${deleted + 1}/${total})`);

      // Navigate back to inbox if needed
      if (!window.location.pathname.includes("/direct/inbox")) {
        window.location.href = "https://www.instagram.com/direct/inbox/?dm_cleaner=worker";
        return;
      }

      const success = await deleteTopChat();

      if (success) {
        deleted++;
        failStreak = 0;
        sendProgress("running", deleted, total, `Siliniyor... (${deleted}/${total})`);

        if (deleted % profile.pauseEvery === 0) {
          sendProgress("running", deleted, total, `☕ Doğal mola... (${deleted}/${total})`);
          await delayFromProfile(profile, "pauseDuration");
        } else {
          await delayFromProfile(profile, "afterDelete");
        }
      } else {
        failStreak++;
        console.warn(`[DM Worker] Failed (streak: ${failStreak})`);

        if (failStreak >= 5) {
          sendProgress("done", deleted, total, `⚠️ ${deleted} silindi, ${failStreak} ardışık hata.`);
          return;
        }
        await randomDelay(2000, 3000);
      }
    }

    sendProgress("done", deleted, deleted, `✅ ${deleted} sohbet başarıyla silindi!`);
  }

  function sendProgress(status, deleted, total, statusText) {
    try {
      const action = status === "done" ? "delete_complete" : status === "paused" ? "delete_paused" : "progress_update";
      chrome.runtime.sendMessage({ action, deleted, total, statusText }).catch(() => { });
    } catch (e) { }
  }

} else {
  // ==========================================
  //  MAIN MODE — UI only
  // ==========================================

  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.action === "progress_update") showProgressUI(msg.deleted, msg.total, msg.statusText, "running");
      if (msg.action === "delete_complete") showProgressUI(msg.deleted, msg.total, msg.statusText, "done");
      if (msg.action === "delete_paused") showProgressUI(msg.deleted, msg.total, msg.statusText, "paused");
    });
  } catch (e) { }

  try {
    chrome.storage.local.get(["dmCleanerState"], (data) => {
      const s = data?.dmCleanerState;
      if (s && (s.status === "running" || s.status === "paused" || s.status === "starting")) {
        showProgressUI(s.deleted || 0, s.total || 0, s.statusText || "", s.status);
      }
    });
  } catch (e) { }

  function showProgressUI(deleted, total, statusText, status) {
    let panel = document.querySelector("#dm-cleaner-progress");
    if (!panel) { panel = document.createElement("div"); panel.id = "dm-cleaner-progress"; document.body.appendChild(panel); }

    const percent = total > 0 ? Math.round((deleted / total) * 100) : 0;
    const isPaused = status === "paused";
    const isDone = status === "done";

    panel.innerHTML = `
      <div style="position:fixed;bottom:24px;right:24px;z-index:99999;background:linear-gradient(135deg,#1a1a2e,#16213e);color:#fff;border-radius:16px;padding:20px 24px;min-width:320px;max-width:380px;box-shadow:0 8px 32px rgba(0,0,0,0.35),0 0 0 1px rgba(255,255,255,0.08);font-family:'Segoe UI',-apple-system,sans-serif;backdrop-filter:blur(12px);">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
          <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(45deg,${isDone ? '#2ecc71,#27ae60' : isPaused ? '#f39c12,#e67e22' : '#ed4956,#d6249f'});display:flex;align-items:center;justify-content:center;font-size:18px;">${isDone ? '✅' : isPaused ? '⏸️' : ''}</div>
          <div style="flex:1;"><div style="font-weight:700;font-size:15px;">DM Cleaner</div><div style="font-size:12px;color:#a0a0b8;margin-top:2px;">${statusText}</div></div>
        </div>
        <div style="background:rgba(255,255,255,0.08);border-radius:8px;height:8px;overflow:hidden;margin-bottom:12px;">
          <div style="width:${percent}%;height:100%;background:linear-gradient(90deg,#ed4956,#d6249f,#285aeb);border-radius:8px;transition:width 0.4s;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:12px;color:#8888a0;">${deleted}/${total} (${percent}%)</span>
          <div style="display:flex;gap:8px;">
            ${isDone ? '<button id="dm-cleaner-close" style="background:rgba(255,255,255,0.1);border:none;color:#fff;border-radius:8px;padding:6px 14px;font-size:12px;cursor:pointer;font-weight:600;">Kapat</button>'
        : isPaused ? '<button id="dm-cleaner-resume" style="background:linear-gradient(45deg,#2ecc71,#27ae60);border:none;color:#fff;border-radius:8px;padding:6px 14px;font-size:12px;cursor:pointer;font-weight:600;">▶️ Devam</button><button id="dm-cleaner-close" style="background:rgba(255,255,255,0.1);border:none;color:#ff6b6b;border-radius:8px;padding:6px 14px;font-size:12px;cursor:pointer;font-weight:600;">✕ İptal</button>'
          : '<button id="dm-cleaner-pause" style="background:rgba(255,255,255,0.1);border:none;color:#f39c12;border-radius:8px;padding:6px 14px;font-size:12px;cursor:pointer;font-weight:600;">⏸️ Duraklat</button><button id="dm-cleaner-stop" style="background:rgba(255,255,255,0.1);border:none;color:#ff6b6b;border-radius:8px;padding:6px 14px;font-size:12px;cursor:pointer;font-weight:600;">⏹ Durdur</button>'}
          </div>
        </div>
      </div>`;

    panel.querySelector("#dm-cleaner-pause")?.addEventListener("click", () => {
      try { chrome.runtime.sendMessage({ action: "stop_delete" }).catch(() => { }); } catch (e) { }
      showProgressUI(deleted, total, `⏸️ Duraklatıldı (${deleted}/${total})`, "paused");
    });
    panel.querySelector("#dm-cleaner-resume")?.addEventListener("click", () => {
      try { chrome.runtime.sendMessage({ action: "resume_delete" }).catch(() => { }); } catch (e) { }
      showProgressUI(deleted, total, "Devam ediliyor...", "running");
    });
    panel.querySelector("#dm-cleaner-stop")?.addEventListener("click", () => {
      try { chrome.runtime.sendMessage({ action: "stop_delete" }).catch(() => { }); } catch (e) { }
      panel.remove();
      try { chrome.storage.local.set({ dmCleanerState: { status: "idle" } }); } catch (e) { }
    });
    panel.querySelector("#dm-cleaner-close")?.addEventListener("click", () => {
      panel.remove();
      try { chrome.storage.local.set({ dmCleanerState: { status: "idle" } }); } catch (e) { }
    });
  }

  // Modal
  function showModal({ title, message, icon, confirmText = "Tamam", cancelText = "Vazgeç", showCancel = true, dangerous = false, onConfirm }) {
    document.querySelector("#dm-cleaner-modal")?.remove();
    const m = document.createElement("div"); m.id = "dm-cleaner-modal";
    m.innerHTML = `<div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(6px);z-index:999999;display:flex;align-items:center;justify-content:center;">
      <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border-radius:18px;padding:28px 30px 22px;max-width:380px;width:90%;box-shadow:0 16px 48px rgba(0,0,0,0.5);color:#fff;font-family:'Segoe UI',sans-serif;">
        <div style="text-align:center;margin-bottom:18px;"><div style="font-size:42px;margin-bottom:14px;">${icon}</div><div style="font-size:18px;font-weight:700;letter-spacing:0.3px;">${title}</div></div>
        <div style="font-size:13px;color:#a0a0b8;text-align:center;line-height:1.6;margin-bottom:22px;">${message}</div>
        <div style="display:flex;gap:10px;justify-content:center;">
          ${showCancel ? `<button id="dm-modal-cancel" style="flex:1;padding:11px 16px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);color:#aaa;font-size:14px;font-weight:600;cursor:pointer;">${cancelText}</button>` : ""}
          <button id="dm-modal-confirm" style="flex:1;padding:11px 16px;border-radius:10px;border:none;background:${dangerous ? 'linear-gradient(45deg,#ed4956,#d6249f)' : 'linear-gradient(45deg,#285aeb,#3498db)'};color:#fff;font-size:14px;font-weight:600;cursor:pointer;">${confirmText}</button>
        </div>
      </div></div>`;
    document.body.appendChild(m);
    m.querySelector("#dm-modal-confirm").onclick = () => { m.remove(); onConfirm?.(); };
    m.querySelector("#dm-modal-cancel")?.addEventListener("click", () => m.remove());
    m.firstElementChild.addEventListener("click", (e) => { if (e.target === m.firstElementChild) m.remove(); });
  }

  // Delete button
  function addButton() {
    if (!window.location.pathname.startsWith("/direct")) return;
    if (document.querySelector("#bulk-delete-dm-btn")) return;

    // Find the "Mesajlar" heading in the DM panel (not the sidebar nav)
    // The correct one is near "İstekler" text
    let headingRow = null;
    const allEls = document.querySelectorAll("span, div, h1, h2");
    for (const el of allEls) {
      if (el.childElementCount === 0 && el.textContent.trim() === "Mesajlar") {
        // Walk up to find the row containing both "Mesajlar" and "İstekler"
        let current = el;
        for (let i = 0; i < 5; i++) {
          current = current.parentElement;
          if (!current) break;
          if (current.textContent.includes("İstekler") && !current.textContent.includes("Ana Sayfa")) {
            headingRow = current;
            break;
          }
        }
        if (headingRow) break;
      }
    }

    const btn = document.createElement("button");
    btn.id = "bulk-delete-dm-btn";
    btn.innerText = "Tüm DM'leri Sil";

    if (headingRow) {
      btn.style.cssText = "width:100%;background:linear-gradient(45deg,#ed4956,#d6249f);color:white;border:none;border-radius:10px;padding:10px 16px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 2px 10px rgba(237,73,86,0.3);transition:all 0.25s;font-family:'Segoe UI',sans-serif;margin-top:8px;margin-bottom:4px;";
    } else {
      btn.style.cssText = "position:fixed;bottom:24px;left:24px;z-index:99998;background:linear-gradient(45deg,#ed4956,#d6249f);color:white;border:none;border-radius:14px;padding:14px 24px;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 4px 16px rgba(237,73,86,0.4);transition:all 0.25s;font-family:'Segoe UI',sans-serif;";
    }

    btn.onmouseenter = () => { btn.style.transform = "translateY(-1px) scale(1.02)"; btn.style.boxShadow = "0 4px 16px rgba(237,73,86,0.5)"; };
    btn.onmouseleave = () => { btn.style.transform = ""; btn.style.boxShadow = headingRow ? "0 2px 10px rgba(237,73,86,0.3)" : "0 4px 16px rgba(237,73,86,0.4)"; };
    btn.onclick = () => {
      try {
        chrome.storage.local.get(["dmCleanerState"], (d) => {
          const s = d?.dmCleanerState;
          if (s && (s.status === "running" || s.status === "starting")) {
            showModal({ title: "İşlem Devam Ediyor", message: "Silme işlemi zaten devam ediyor!", icon: "⚠️", showCancel: false });
            return;
          }
          showModal({
            title: "Tüm DM'leri Sil", message: "Tüm sohbetleriniz otomatik olarak tek tek silinecek. İşlem sırasında ayrı bir pencere açılacak, bu pencereyi kapatmayın.", icon: "", confirmText: "Silmeye Başla", dangerous: true, onConfirm: () => {
              try { chrome.runtime.sendMessage({ action: "start_delete" }).catch(() => { }); } catch (e) { }
              showProgressUI(0, 0, "Başlatılıyor...", "starting");
            }
          });
        });
      } catch (e) { }
    };

    if (headingRow) {
      headingRow.insertAdjacentElement("afterend", btn);
    } else {
      document.body.appendChild(btn);
    }
  }

  setInterval(addButton, 2000);
}
