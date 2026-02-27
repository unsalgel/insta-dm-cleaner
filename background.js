// =============================================
// Instagram DM Cleaner — Background Service Worker
// Manages deletion window + messaging with content scripts
// =============================================

let deleteWindowId = null;
let deleteTabId = null;
let mainTabId = null;

// --- Listen for messages from content scripts ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "start_delete") {
        mainTabId = sender.tab?.id || null;
        startDeleteWindow();
        sendResponse({ ok: true });
    }

    if (msg.action === "stop_delete") {
        stopDeleteWindow();
        sendResponse({ ok: true });
    }

    if (msg.action === "resume_delete") {
        mainTabId = sender.tab?.id || null;
        resumeDeleteWindow();
        sendResponse({ ok: true });
    }

    if (msg.action === "get_status") {
        chrome.storage.local.get(["dmCleanerState"], (data) => {
            sendResponse(data.dmCleanerState || { status: "idle" });
        });
        return true; // async response
    }

    // Progress update from delete window → forward to main tab
    if (msg.action === "progress_update") {
        chrome.storage.local.set({
            dmCleanerState: {
                status: "running",
                deleted: msg.deleted,
                total: msg.total,
                statusText: msg.statusText,
            },
        });

        // Forward to main tab
        if (mainTabId) {
            chrome.tabs.sendMessage(mainTabId, {
                action: "progress_update",
                deleted: msg.deleted,
                total: msg.total,
                statusText: msg.statusText,
            }).catch(() => { });
        }
        sendResponse({ ok: true });
    }

    // Deletion complete
    if (msg.action === "delete_complete") {
        chrome.storage.local.set({
            dmCleanerState: {
                status: "done",
                deleted: msg.deleted,
                total: msg.total,
                statusText: msg.statusText,
            },
        });

        if (mainTabId) {
            chrome.tabs.sendMessage(mainTabId, {
                action: "delete_complete",
                deleted: msg.deleted,
                total: msg.total,
                statusText: msg.statusText,
            }).catch(() => { });
        }

        // Close the delete window after a short delay
        setTimeout(() => {
            closeDeleteWindow();
        }, 2000);

        sendResponse({ ok: true });
    }

    // Paused
    if (msg.action === "delete_paused") {
        chrome.storage.local.set({
            dmCleanerState: {
                status: "paused",
                deleted: msg.deleted,
                total: msg.total,
                statusText: msg.statusText,
            },
        });

        if (mainTabId) {
            chrome.tabs.sendMessage(mainTabId, {
                action: "delete_paused",
                deleted: msg.deleted,
                total: msg.total,
                statusText: msg.statusText,
            }).catch(() => { });
        }

        sendResponse({ ok: true });
    }

    return false;
});

// --- Open a small popup window for deletion ---
function startDeleteWindow() {
    // Set state to running
    chrome.storage.local.set({
        dmCleanerState: { status: "starting", deleted: 0, total: 0, statusText: "Başlatılıyor..." },
        dmCleanerCommand: "start",
    });

    // Close existing window if any
    closeDeleteWindow().then(() => {
        chrome.windows.create(
            {
                url: "https://www.instagram.com/direct/inbox/?dm_cleaner=worker",
                type: "popup",
                width: 450,
                height: 700,
                left: 50,
                top: 50,
                focused: false, // Don't steal focus
            },
            (win) => {
                if (win) {
                    deleteWindowId = win.id;
                    deleteTabId = win.tabs?.[0]?.id || null;
                    console.log("[DM Cleaner BG] Silme penceresi açıldı:", deleteWindowId);
                }
            }
        );
    });
}

// --- Resume: just send command to existing window ---
function resumeDeleteWindow() {
    chrome.storage.local.set({ dmCleanerCommand: "resume" });

    if (deleteTabId) {
        chrome.tabs.sendMessage(deleteTabId, { action: "resume" }).catch(() => {
            // Tab might be gone, restart
            startDeleteWindow();
        });
    } else {
        startDeleteWindow();
    }
}

// --- Stop deletion ---
function stopDeleteWindow() {
    chrome.storage.local.set({ dmCleanerCommand: "pause" });

    if (deleteTabId) {
        chrome.tabs.sendMessage(deleteTabId, { action: "pause" }).catch(() => { });
    }
}

// --- Close the delete window ---
function closeDeleteWindow() {
    return new Promise((resolve) => {
        if (deleteWindowId) {
            chrome.windows.remove(deleteWindowId, () => {
                deleteWindowId = null;
                deleteTabId = null;
                resolve();
            });
        } else {
            resolve();
        }
    });
}

// --- Handle window close (user manually closes delete window) ---
chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId === deleteWindowId) {
        deleteWindowId = null;
        deleteTabId = null;

        chrome.storage.local.get(["dmCleanerState"], (data) => {
            const state = data.dmCleanerState || {};
            if (state.status === "running" || state.status === "starting") {
                chrome.storage.local.set({
                    dmCleanerState: {
                        ...state,
                        status: "paused",
                        statusText: "Pencere kapatıldı. Devam etmek için tekrar başlat.",
                    },
                });

                if (mainTabId) {
                    chrome.tabs.sendMessage(mainTabId, {
                        action: "delete_paused",
                        deleted: state.deleted || 0,
                        total: state.total || 0,
                        statusText: "Pencere kapatıldı. Devam etmek için ▶️ tıkla.",
                    }).catch(() => { });
                }
            }
        });
    }
});
