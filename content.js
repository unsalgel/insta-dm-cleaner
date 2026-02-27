// =============================================
// Instagram DM Cleaner — Content Script v3.1
// Dual mode: Main Window UI + Worker Window Deletion
// Speed settings + Anti-bot safety + Empty inbox fix
// =============================================

const IS_WORKER = window.location.search.includes("dm_cleaner=worker");

console.log(`[DM Cleaner] Loaded (${IS_WORKER ? "WORKER" : "MAIN"} mode) v3.1`);

// ==========================================
//  SPEED PROFILES
// ==========================================
const SPEED_PROFILES = {
  slow: {
    clickDelay: [1500, 2500],     // Between clicks
    afterDelete: [2500, 4000],    // After successful delete
    pauseEvery: 8,                // Pause every N deletions
    pauseDuration: [6000, 12000], // Natural pause duration
  },
  normal: {
    clickDelay: [500, 900],
    afterDelete: [1000, 1800],
    pauseEvery: 12,
    pauseDuration: [4000, 7000],
  },
  fast: {
    clickDelay: [300, 600],
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
    chrome.storage.local.get(["dmCleanerSpeed"], (data) => {
      const speed = data.dmCleanerSpeed || "normal";
      resolve(SPEED_PROFILES[speed] || SPEED_PROFILES.normal);
    });
  });
}

function waitForElement(selectors, texts, timeout = 5000) {
  return new Promise((resolve) => {
    const check = () => {
      const elements = document.querySelectorAll(selectors);
      for (const el of elements) {
        const t = el.textContent.trim();
        for (const text of texts) {
          if (t === text) return el;
        }
      }
      return null;
    };

    const existing = check();
    if (existing) return resolve(existing);

    const observer = new MutationObserver(() => {
      const found = check();
      if (found) {
        observer.disconnect();
        resolve(found);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(check());
    }, timeout);
  });
}

// Check if inbox is empty (Instagram shows a message when no chats exist)
function isInboxEmpty() {
  const emptyTexts = [
    "Chats will appear here",
    "Sohbetler burada görünecek",
    "No messages yet",
    "Henüz mesaj yok",
    "Start a conversation",
    "Send a message",
    "Mesaj gönder",
  ];

  const allText = document.body?.innerText || "";
  for (const text of emptyTexts) {
    if (allText.includes(text)) return true;
  }
  return false;
}

// ==========================================
//  WORKER MODE — Runs in the popup window
// ==========================================

if (IS_WORKER) {
  let isPaused = false;

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "pause") {
      isPaused = true;
      console.log("[DM Worker] Duraklatıldı");
    }
    if (msg.action === "resume") {
      isPaused = false;
      console.log("[DM Worker] Devam ediliyor");
    }
  });

  window.addEventListener("load", () => {
    setTimeout(() => runWorkerDeletion(), 2500);
  });

  async function runWorkerDeletion() {
    console.log("[DM Worker] Silme başlatılıyor...");

    const { dmCleanerCommand } = await chrome.storage.local.get(["dmCleanerCommand"]);
    if (dmCleanerCommand === "pause") isPaused = true;

    const profile = await getSpeedProfile();
    console.log("[DM Worker] Hız profili:", JSON.stringify(profile));

    let deleted = 0;
    let total = 0;
    let failStreak = 0;

    await randomDelay(1000, 1500);

    // Check if inbox is already empty
    if (isInboxEmpty()) {
      sendProgress("done", 0, 0, "Silinecek sohbet bulunamadı!");
      return;
    }

    total = countVisibleChats();
    console.log("[DM Worker] Görünen sohbet:", total);

    if (total === 0) {
      sendProgress("done", 0, 0, "Silinecek sohbet bulunamadı!");
      return;
    }

    sendProgress("running", 0, total, `${total} sohbet bulundu. Siliniyor...`);

    while (true) {
      // Pause check
      while (isPaused) {
        sendProgress("paused", deleted, total, `⏸️ Duraklatıldı (${deleted}/${total})`);
        await randomDelay(500, 800);
        const { dmCleanerCommand: cmd } = await chrome.storage.local.get(["dmCleanerCommand"]);
        if (cmd === "resume" || cmd === "start") isPaused = false;
      }

      // Empty inbox check
      if (isInboxEmpty()) {
        console.log("[DM Worker] Inbox boş, işlem tamamlandı.");
        break;
      }

      const remaining = countVisibleChats();
      if (remaining === 0) {
        // Double-check: wait a moment and re-check
        await randomDelay(1500, 2000);
        if (countVisibleChats() === 0 || isInboxEmpty()) {
          console.log("[DM Worker] Sohbet kalmadı.");
          break;
        }
      }

      const newTotal = deleted + remaining;
      if (newTotal > total) total = newTotal;

      sendProgress("running", deleted, total, `Siliniyor... (${deleted + 1}/${total})`);

      const success = await deleteTopChat(profile);

      if (success) {
        deleted++;
        failStreak = 0;
        sendProgress("running", deleted, total, `Siliniyor... (${deleted}/${total})`);

        // Natural pause every N deletions (anti-bot)
        if (deleted % profile.pauseEvery === 0) {
          const pauseText = `☕ Doğal mola... (${deleted}/${total})`;
          sendProgress("running", deleted, total, pauseText);
          console.log(`[DM Worker] Doğal mola (her ${profile.pauseEvery} silmede)`);
          await delayFromProfile(profile, "pauseDuration");
        } else {
          await delayFromProfile(profile, "afterDelete");
        }
      } else {
        failStreak++;
        console.warn(`[DM Worker] Başarısız (streak: ${failStreak})`);

        if (failStreak >= 5) {
          // Before giving up, check if inbox is actually empty
          if (isInboxEmpty() || countVisibleChats() === 0) {
            console.log("[DM Worker] Inbox boş, başarılı sayılıyor.");
            break;
          }
          sendProgress("done", deleted, total, `⚠️ ${deleted} silindi, ${failStreak} ardışık hata.`);
          return;
        }

        if (!window.location.pathname.includes("/direct/inbox")) {
          window.location.href = "https://www.instagram.com/direct/inbox/?dm_cleaner=worker";
          return;
        }
        await randomDelay(1500, 2500);
      }
    }

    sendProgress("done", deleted, deleted, `✅ ${deleted} sohbet başarıyla silindi!`);
    console.log(`[DM Worker] ✅ ${deleted} sohbet silindi.`);
  }

  function sendProgress(status, deleted, total, statusText) {
    const action = status === "done" ? "delete_complete" : status === "paused" ? "delete_paused" : "progress_update";
    chrome.runtime.sendMessage({ action, deleted, total, statusText }).catch(() => { });
  }

  function countVisibleChats() {
    const chatRows = document.querySelectorAll('div[role="button"][tabindex="0"]');
    let count = 0;
    for (const row of chatRows) {
      if (row.closest('div[role="dialog"]')) continue;
      const hasAvatar = Boolean(row.querySelector('img[width="56"], img[height="56"], canvas'));
      const hasTime = Boolean(row.querySelector("time, abbr"));
      if ((hasAvatar || hasTime) && row.offsetParent) count++;
    }
    return count;
  }

  async function deleteTopChat(profile) {
    const chatRows = document.querySelectorAll('div[role="button"][tabindex="0"]');
    let targetChat = null;

    for (const row of chatRows) {
      if (row.closest('div[role="dialog"]')) continue;
      const hasAvatar = Boolean(row.querySelector('img[width="56"], img[height="56"], canvas'));
      const hasTime = Boolean(row.querySelector("time, abbr"));
      if ((hasAvatar || hasTime) && row.offsetParent) {
        targetChat = row;
        break;
      }
    }

    if (!targetChat) return false;

    // Click chat
    targetChat.click();
    await delayFromProfile(profile, "clickDelay");

    // Info button
    const infoBtn = findInfoButton();
    if (!infoBtn) {
      console.log("[DM Worker] Bilgi butonu bulunamadı");
      goBack();
      await randomDelay(500, 800);
      return false;
    }
    infoBtn.click();
    await delayFromProfile(profile, "clickDelay");

    // Delete button
    const deleteBtn = await waitForElement(
      'span, button, div[role="button"], div[role="listitem"]',
      ["Sohbeti sil", "Delete chat", "Sil", "Delete"],
      3000
    );

    if (!deleteBtn) {
      console.log("[DM Worker] Silme butonu bulunamadı");
      goBack();
      await randomDelay(500, 800);
      return false;
    }

    const clickTarget = deleteBtn.closest('div[role="button"]') || deleteBtn.closest('div[role="listitem"]') || deleteBtn;
    clickTarget.click();
    await delayFromProfile(profile, "clickDelay");

    // Confirm
    const confirmBtn = await waitForConfirmButton(3000);
    if (!confirmBtn) {
      console.log("[DM Worker] Onay butonu bulunamadı");
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await randomDelay(300, 500);
      return false;
    }

    confirmBtn.click();
    await delayFromProfile(profile, "clickDelay");

    console.log("[DM Worker] ✅ Sohbet silindi");
    return true;
  }

  function findInfoButton() {
    const selectors = [
      'svg[aria-label="Konuşma Bilgileri"]',
      'svg[aria-label="Chat info"]',
      'svg[aria-label="Conversation information"]',
      'svg[aria-label*="Bilgi"]',
      'svg[aria-label*="Info"]',
      'svg[aria-label*="info"]',
      'svg[aria-label*="Detail"]',
    ];

    for (const sel of selectors) {
      const svg = document.querySelector(sel);
      if (svg) {
        const btn = svg.closest('div[role="button"]') || svg.closest("button");
        if (btn) return btn;
      }
    }

    const allSvgs = document.querySelectorAll('div[role="button"] svg, button svg');
    for (const svg of allSvgs) {
      if (svg.querySelector("circle") && svg.querySelector("line")) {
        const btn = svg.closest('div[role="button"]') || svg.closest("button");
        if (btn && btn.offsetParent) return btn;
      }
    }

    return null;
  }

  async function waitForConfirmButton(timeout = 3000) {
    return new Promise((resolve) => {
      const check = () => {
        const dialog = document.querySelector('div[role="dialog"]');
        if (!dialog) return null;
        const buttons = dialog.querySelectorAll("button");
        for (const button of buttons) {
          const text = button.textContent.trim();
          if (text === "Sil" || text === "Delete" || text === "Sohbeti sil" || text === "Delete chat") {
            return button;
          }
        }
        return null;
      };

      const found = check();
      if (found) return resolve(found);

      const observer = new MutationObserver(() => {
        const f = check();
        if (f) { observer.disconnect(); resolve(f); }
      });

      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { observer.disconnect(); resolve(check()); }, timeout);
    });
  }

  function goBack() {
    const backBtn =
      document.querySelector('svg[aria-label="Geri"]')?.closest('div[role="button"]') ||
      document.querySelector('svg[aria-label="Back"]')?.closest('div[role="button"]');
    if (backBtn) backBtn.click();
  }

} else {
  // ==========================================
  //  MAIN MODE — Runs in the user's active tab
  // ==========================================

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "progress_update") {
      showProgressUI(msg.deleted, msg.total, msg.statusText, "running");
    }
    if (msg.action === "delete_complete") {
      showProgressUI(msg.deleted, msg.total, msg.statusText, "done");
    }
    if (msg.action === "delete_paused") {
      showProgressUI(msg.deleted, msg.total, msg.statusText, "paused");
    }
  });

  // Restore UI if there's active state
  chrome.storage.local.get(["dmCleanerState"], (data) => {
    const state = data.dmCleanerState;
    if (state && (state.status === "running" || state.status === "paused" || state.status === "starting")) {
      showProgressUI(state.deleted || 0, state.total || 0, state.statusText || "", state.status);
    }
  });

  function showProgressUI(deleted, total, statusText, status) {
    let panel = document.querySelector("#dm-cleaner-progress");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "dm-cleaner-progress";
      document.body.appendChild(panel);
    }

    const percent = total > 0 ? Math.round((deleted / total) * 100) : 0;
    const isPaused = status === "paused";
    const isDone = status === "done";

    // Detect natural pause
    const isNaturalPause = statusText.includes("☕");

    panel.innerHTML = `
      <div style="
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 99999;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        color: #fff;
        border-radius: 16px;
        padding: 20px 24px;
        min-width: 320px;
        max-width: 380px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.08);
        font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
        backdrop-filter: blur(12px);
      ">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
          <div style="
            width:36px; height:36px; border-radius:10px;
            background: linear-gradient(45deg, ${isDone ? '#2ecc71, #27ae60' : isPaused ? '#f39c12, #e67e22' : '#ed4956, #d6249f'});
            display:flex; align-items:center; justify-content:center;
            font-size:18px;
          ">${isDone ? '✅' : isPaused ? '⏸️' : isNaturalPause ? '☕' : '🗑️'}</div>
          <div style="flex:1;">
            <div style="font-weight:700; font-size:15px; letter-spacing:0.3px;">DM Cleaner</div>
            <div style="font-size:12px; color:#a0a0b8; margin-top:2px;">${statusText}</div>
          </div>
        </div>
        <div style="
          background: rgba(255,255,255,0.08);
          border-radius: 8px;
          height: 8px;
          overflow: hidden;
          margin-bottom: 12px;
        ">
          <div style="
            width: ${percent}%;
            height: 100%;
            background: linear-gradient(90deg, #ed4956, #d6249f, #285aeb);
            border-radius: 8px;
            transition: width 0.4s ease;
          "></div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:12px; color:#8888a0;">${deleted} / ${total} (${percent}%)</span>
          <div style="display:flex; gap:8px;">
            ${isDone ? `
              <button id="dm-cleaner-close" style="
                background: rgba(255,255,255,0.1); border: none; color: #fff;
                border-radius: 8px; padding: 6px 14px; font-size: 12px;
                cursor: pointer; font-weight: 600;
              ">Kapat</button>
            ` : isPaused ? `
              <button id="dm-cleaner-resume" style="
                background: linear-gradient(45deg, #2ecc71, #27ae60); border: none; color: #fff;
                border-radius: 8px; padding: 6px 14px; font-size: 12px;
                cursor: pointer; font-weight: 600;
              ">▶️ Devam Et</button>
              <button id="dm-cleaner-close" style="
                background: rgba(255,255,255,0.1); border: none; color: #ff6b6b;
                border-radius: 8px; padding: 6px 14px; font-size: 12px;
                cursor: pointer; font-weight: 600;
              ">✕ İptal</button>
            ` : `
              <button id="dm-cleaner-pause" style="
                background: rgba(255,255,255,0.1); border: none; color: #f39c12;
                border-radius: 8px; padding: 6px 14px; font-size: 12px;
                cursor: pointer; font-weight: 600;
              ">⏸️ Duraklat</button>
              <button id="dm-cleaner-stop" style="
                background: rgba(255,255,255,0.1); border: none; color: #ff6b6b;
                border-radius: 8px; padding: 6px 14px; font-size: 12px;
                cursor: pointer; font-weight: 600;
              ">⏹ Durdur</button>
            `}
          </div>
        </div>
      </div>
    `;

    const pauseBtn = panel.querySelector("#dm-cleaner-pause");
    const resumeBtn = panel.querySelector("#dm-cleaner-resume");
    const stopBtn = panel.querySelector("#dm-cleaner-stop");
    const closeBtn = panel.querySelector("#dm-cleaner-close");

    if (pauseBtn) {
      pauseBtn.onclick = () => {
        chrome.runtime.sendMessage({ action: "stop_delete" });
        showProgressUI(deleted, total, `⏸️ Duraklatıldı (${deleted}/${total})`, "paused");
      };
    }
    if (resumeBtn) {
      resumeBtn.onclick = () => {
        chrome.runtime.sendMessage({ action: "resume_delete" });
        showProgressUI(deleted, total, "Devam ediliyor...", "running");
      };
    }
    if (stopBtn) {
      stopBtn.onclick = () => {
        chrome.runtime.sendMessage({ action: "stop_delete" });
        removeProgressUI();
        chrome.storage.local.set({ dmCleanerState: { status: "idle" } });
      };
    }
    if (closeBtn) {
      closeBtn.onclick = () => {
        removeProgressUI();
        chrome.storage.local.set({ dmCleanerState: { status: "idle" } });
      };
    }
  }

  function removeProgressUI() {
    const panel = document.querySelector("#dm-cleaner-progress");
    if (panel) {
      panel.style.transition = "opacity 0.4s ease, transform 0.4s ease";
      panel.style.opacity = "0";
      panel.style.transform = "translateY(20px)";
      setTimeout(() => panel.remove(), 400);
    }
  }
  // --- Custom Modal Dialog ---
  function showCustomModal({ title, message, icon, confirmText = "Tamam", cancelText = "Vazgeç", showCancel = true, dangerous = false, onConfirm = null }) {
    // Remove existing modal
    const existing = document.querySelector("#dm-cleaner-modal");
    if (existing) existing.remove();

    const modal = document.createElement("div");
    modal.id = "dm-cleaner-modal";
    modal.innerHTML = `
      <div style="
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.6);
        backdrop-filter: blur(6px);
        z-index: 999999;
        display: flex; align-items: center; justify-content: center;
        animation: dmModalFadeIn 0.25s ease;
      ">
        <div style="
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          border-radius: 18px;
          padding: 28px 30px 22px;
          max-width: 380px;
          width: 90%;
          box-shadow: 0 16px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08);
          color: #fff;
          font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
          animation: dmModalSlideIn 0.3s ease;
        ">
          <div style="text-align:center; margin-bottom:16px;">
            <div style="font-size:36px; margin-bottom:10px;">${icon}</div>
            <div style="font-size:18px; font-weight:700; letter-spacing:0.3px;">${title}</div>
          </div>
          <div style="
            font-size:13px; color:#a0a0b8; text-align:center;
            line-height:1.6; margin-bottom:22px; padding: 0 8px;
          ">${message}</div>
          <div style="display:flex; gap:10px; justify-content:center;">
            ${showCancel ? `
              <button id="dm-modal-cancel" style="
                flex:1; padding:11px 16px; border-radius:10px;
                border: 1px solid rgba(255,255,255,0.12);
                background: rgba(255,255,255,0.06);
                color: #aaa; font-size:14px; font-weight:600;
                cursor:pointer; transition: all 0.2s;
              ">${cancelText}</button>
            ` : ""}
            <button id="dm-modal-confirm" style="
              flex:1; padding:11px 16px; border-radius:10px; border:none;
              background: ${dangerous ? 'linear-gradient(45deg, #ed4956, #d6249f)' : 'linear-gradient(45deg, #285aeb, #3498db)'};
              color: #fff; font-size:14px; font-weight:600;
              cursor:pointer; transition: all 0.2s;
              box-shadow: 0 2px 12px ${dangerous ? 'rgba(237,73,86,0.3)' : 'rgba(40,90,235,0.3)'};
            ">${confirmText}</button>
          </div>
        </div>
      </div>
      <style>
        @keyframes dmModalFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes dmModalSlideIn { from { opacity: 0; transform: scale(0.92) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
      </style>
    `;

    document.body.appendChild(modal);

    // Button hover effects
    const confirmBtn = modal.querySelector("#dm-modal-confirm");
    confirmBtn.addEventListener("mouseenter", () => { confirmBtn.style.transform = "translateY(-1px)"; confirmBtn.style.filter = "brightness(1.1)"; });
    confirmBtn.addEventListener("mouseleave", () => { confirmBtn.style.transform = "translateY(0)"; confirmBtn.style.filter = "none"; });

    confirmBtn.onclick = () => {
      modal.remove();
      if (onConfirm) onConfirm();
    };

    const cancelBtn = modal.querySelector("#dm-modal-cancel");
    if (cancelBtn) {
      cancelBtn.addEventListener("mouseenter", () => { cancelBtn.style.background = "rgba(255,255,255,0.1)"; cancelBtn.style.color = "#fff"; });
      cancelBtn.addEventListener("mouseleave", () => { cancelBtn.style.background = "rgba(255,255,255,0.06)"; cancelBtn.style.color = "#aaa"; });
      cancelBtn.onclick = () => modal.remove();
    }

    // Close on backdrop click
    modal.firstElementChild.addEventListener("click", (e) => {
      if (e.target === modal.firstElementChild) modal.remove();
    });
  }

  function addBulkDeleteButton() {
    const path = window.location.pathname;
    if (!path.startsWith("/direct")) return;
    if (document.querySelector("#bulk-delete-dm-btn")) return;

    const dmList = document.querySelector('div[role="button"][tabindex="0"]')
      ?.parentElement?.parentElement;
    if (!dmList) return;

    const btn = document.createElement("button");
    btn.id = "bulk-delete-dm-btn";
    btn.innerText = "🗑️ Tüm DM'leri Sil";
    btn.style.cssText = `
      background: linear-gradient(45deg, #ed4956, #d6249f);
      color: white; border: none; border-radius: 10px;
      padding: 12px 20px; font-size: 14px; font-weight: 600;
      cursor: pointer; width: 100%; margin: 10px 0;
      z-index: 9999; display: block;
      box-shadow: 0 2px 12px rgba(237,73,86,0.3);
      transition: all 0.25s ease; letter-spacing: 0.3px;
    `;

    btn.addEventListener("mouseenter", () => {
      btn.style.transform = "translateY(-2px)";
      btn.style.boxShadow = "0 6px 20px rgba(237,73,86,0.45)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.transform = "translateY(0)";
      btn.style.boxShadow = "0 2px 12px rgba(237,73,86,0.3)";
    });

    btn.onclick = () => {
      chrome.storage.local.get(["dmCleanerState"], (data) => {
        const state = data.dmCleanerState;
        if (state && (state.status === "running" || state.status === "starting")) {
          showCustomModal({
            title: "İşlem Devam Ediyor",
            message: "Silme işlemi zaten devam ediyor!",
            icon: "⚠️",
            showCancel: false,
            confirmText: "Tamam",
          });
          return;
        }

        showCustomModal({
          title: "Tüm DM'leri Sil",
          message: "Ayrı bir pencere açılacak ve silme işlemi orada gerçekleşecek. Başka işlerinize devam edebilirsiniz.",
          icon: "",
          confirmText: "Silmeye Başla",
          cancelText: "Vazgeç",
          showCancel: true,
          dangerous: true,
          onConfirm: () => {
            chrome.runtime.sendMessage({ action: "start_delete" });
            showProgressUI(0, 0, "Başlatılıyor...", "starting");
          },
        });
      });
    };

    const dmScope =
      document.querySelector(".xb57i2i.x1q594ok.x5lxg6s.x78zum5.xdt5ytf.x6ikm8r.x1ja2u2z.x1pq812k.x1rohswg.xfk6m8.x1yqm8si.xjx87ck.xx8ngbg.xwo3gff.x1n2onr6.x1oyok0e.x1odjw0f.x1e4zzel.x1xzczws") ||
      document.querySelector(".x2atdfe.xb57i2i.x1q594ok.x5lxg6s.x78zum5.xdt5ytf.x6ikm8r.x1n2onr6.x1ja2u2z.x1odjw0f.x1e4zzel.x1xzczws");

    if (dmScope) {
      dmScope.insertBefore(btn, dmScope.firstChild);
    } else {
      let header = Array.from(document.querySelectorAll("span,div,h2,h3")).find((el) => {
        const t = el.textContent.trim();
        return t === "Mesajlar" || t === "Messages";
      });
      if (header) {
        header.parentElement.insertBefore(btn, header.nextSibling);
      } else if (dmList) {
        dmList.prepend(btn);
      }
    }
  }

  setInterval(addBulkDeleteButton, 1500);
}
