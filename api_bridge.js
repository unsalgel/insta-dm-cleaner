// =============================================
// Instagram DM Cleaner — API Bridge (MAIN world)
// Handles both inbox API + DOM-based chat deletion
// =============================================

(function () {
    console.log("[DM Cleaner Bridge] Loaded in page context ✅");

    // Utility: wait ms
    function wait(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    // Utility: random delay
    function randomWait(min, max) {
        return wait(Math.floor(Math.random() * (max - min + 1)) + min);
    }

    // Utility: wait for an element matching text
    function waitForText(selector, texts, timeout = 5000) {
        return new Promise(resolve => {
            const check = () => {
                const els = document.querySelectorAll(selector);
                for (const el of els) {
                    const t = el.textContent.trim();
                    for (const text of texts) {
                        if (t === text) return el;
                    }
                }
                return null;
            };
            const found = check();
            if (found) return resolve(found);

            const obs = new MutationObserver(() => {
                const f = check();
                if (f) { obs.disconnect(); resolve(f); }
            });
            obs.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => { obs.disconnect(); resolve(check()); }, timeout);
        });
    }

    window.addEventListener("message", async function (event) {
        if (event.source !== window) return;
        if (!event.data || event.data.type !== "DM_CLEANER_REQUEST") return;

        const { requestId, action, cursor } = event.data;

        try {
            if (action === "fetch_inbox") {
                // Use API for listing (this works fine)
                const csrfMatch = document.cookie.match(/csrftoken=([^;]+)/);
                const csrf = csrfMatch ? csrfMatch[1] : "";
                const claim = sessionStorage.getItem("www-claim-v2") || "0";

                let url = "/api/v1/direct_v2/inbox/?persistentBadging=true&folder=&limit=20&thread_message_limit=1";
                if (cursor) url += "&cursor=" + encodeURIComponent(cursor);

                const resp = await fetch(url, {
                    method: "GET",
                    headers: {
                        "x-csrftoken": csrf,
                        "x-ig-app-id": "936619743392459",
                        "x-requested-with": "XMLHttpRequest",
                        "x-ig-www-claim": claim,
                    },
                    credentials: "include",
                });

                if (!resp.ok) {
                    window.postMessage({ type: "DM_CLEANER_RESPONSE", requestId, success: false, error: "HTTP " + resp.status }, "*");
                    return;
                }

                const data = await resp.json();
                window.postMessage({ type: "DM_CLEANER_RESPONSE", requestId, success: true, data }, "*");

            } else if (action === "delete_top_chat") {
                // DOM-based deletion from MAIN world (full page access)
                const result = await deleteTopChatDOM();
                window.postMessage({ type: "DM_CLEANER_RESPONSE", requestId, success: result.success, error: result.error || null }, "*");

            } else if (action === "count_chats") {
                const count = countChatsDOM();
                window.postMessage({ type: "DM_CLEANER_RESPONSE", requestId, success: true, count }, "*");
            }
        } catch (err) {
            console.error("[DM Bridge] Error:", err);
            window.postMessage({ type: "DM_CLEANER_RESPONSE", requestId, success: false, error: err.message }, "*");
        }
    });

    // Count visible chats using DOM
    function countChatsDOM() {
        // Method 1: Count thread links
        const threadLinks = document.querySelectorAll('a[href*="/direct/t/"]');
        let count = 0;
        for (const link of threadLinks) {
            if (link.offsetParent && !link.closest('[role="dialog"]')) count++;
        }
        if (count > 0) {
            console.log("[DM Bridge] Found", count, "chats via thread links");
            return count;
        }

        // Method 2: Find chat rows with avatars
        const allRows = document.querySelectorAll('[role="listitem"], [role="option"], [role="row"], [role="button"][tabindex="0"]');
        for (const row of allRows) {
            if (row.closest('[role="dialog"]')) continue;
            if (!row.offsetParent) continue;
            if (row.querySelector('img') || row.querySelector('canvas')) count++;
        }
        console.log("[DM Bridge] Found", count, "chats via role elements");
        return count;
    }

    // Delete the top chat via DOM clicks (from MAIN world = full access)
    async function deleteTopChatDOM() {
        try {
            // Step 1: Find first chat and click it
            let chatEl = null;

            // Try thread links first (most stable)
            const threadLinks = document.querySelectorAll('a[href*="/direct/t/"]');
            for (const link of threadLinks) {
                if (link.offsetParent && !link.closest('[role="dialog"]')) {
                    chatEl = link;
                    break;
                }
            }

            // Fallback: role-based elements
            if (!chatEl) {
                const rows = document.querySelectorAll('[role="listitem"], [role="option"], [role="button"][tabindex="0"]');
                for (const row of rows) {
                    if (row.closest('[role="dialog"]')) continue;
                    if (!row.offsetParent) continue;
                    if (row.querySelector('img') || row.querySelector('canvas')) {
                        chatEl = row;
                        break;
                    }
                }
            }

            if (!chatEl) {
                console.warn("[DM Bridge] No chat element found");
                return { success: false, error: "No chat found" };
            }

            console.log("[DM Bridge] Clicking chat...");
            chatEl.click();
            await randomWait(800, 1200);

            // Step 2: Find and click the info/details button (ℹ️ icon)
            const infoBtn = findInfoButton();
            if (!infoBtn) {
                console.warn("[DM Bridge] Info button not found");
                goBack();
                await randomWait(300, 500);
                return { success: false, error: "Info button not found" };
            }

            console.log("[DM Bridge] Clicking info button...");
            infoBtn.click();
            await randomWait(800, 1200);

            // Step 3: Find and click "Delete chat" / "Sohbeti sil"
            const deleteBtn = await waitForText(
                'span, button, div[role="button"], div[role="listitem"], div[role="menuitem"]',
                ["Sohbeti sil", "Delete chat", "Sil", "Delete"],
                4000
            );

            if (!deleteBtn) {
                console.warn("[DM Bridge] Delete button not found");
                goBack();
                await randomWait(300, 500);
                return { success: false, error: "Delete button not found" };
            }

            console.log("[DM Bridge] Clicking delete button...");
            const clickTarget = deleteBtn.closest('[role="button"]') || deleteBtn.closest('[role="menuitem"]') || deleteBtn.closest('[role="listitem"]') || deleteBtn;
            clickTarget.click();
            await randomWait(800, 1200);

            // Step 4: Find and click confirm button in dialog
            const confirmBtn = await waitForConfirm(4000);
            if (!confirmBtn) {
                console.warn("[DM Bridge] Confirm button not found");
                pressEscape();
                await randomWait(300, 500);
                return { success: false, error: "Confirm button not found" };
            }

            console.log("[DM Bridge] Clicking confirm...");
            confirmBtn.click();
            await randomWait(500, 800);

            console.log("[DM Bridge] ✅ Chat deleted successfully");
            return { success: true };

        } catch (err) {
            console.error("[DM Bridge] Delete error:", err);
            return { success: false, error: err.message };
        }
    }

    function findInfoButton() {
        // Try various info/details button selectors
        const ariaLabels = [
            'Konuşma Bilgileri', 'Chat info', 'Conversation information',
            'Bilgi', 'Info', 'info', 'Detail', 'Details', 'Ayrıntılar',
            'Thread details', 'View thread details',
        ];

        for (const label of ariaLabels) {
            const svg = document.querySelector(`svg[aria-label="${label}"]`) ||
                document.querySelector(`svg[aria-label*="${label}"]`);
            if (svg) {
                const btn = svg.closest('[role="button"]') || svg.closest('button') || svg.parentElement;
                if (btn && btn.offsetParent) return btn;
            }
        }

        // Fallback: look for the circle-i icon SVG pattern
        const headerArea = document.querySelector('header') || document.querySelector('[role="banner"]');
        if (headerArea) {
            const buttons = headerArea.querySelectorAll('[role="button"], button');
            for (const btn of buttons) {
                if (btn.querySelector('svg') && btn.offsetParent) {
                    // Skip back button (usually first), take the last button (usually info)
                    const svgs = headerArea.querySelectorAll('[role="button"] svg, button svg');
                    if (svgs.length > 0) {
                        const lastSvg = svgs[svgs.length - 1];
                        return lastSvg.closest('[role="button"]') || lastSvg.closest('button');
                    }
                }
            }
        }

        // Last fallback: find rightmost button with SVG in the top area
        const topButtons = document.querySelectorAll('[role="button"] svg, button svg');
        let rightmost = null;
        let maxRight = 0;
        for (const svg of topButtons) {
            const btn = svg.closest('[role="button"]') || svg.closest('button');
            if (!btn || !btn.offsetParent) continue;
            const rect = btn.getBoundingClientRect();
            // Only consider buttons in the top portion of the page
            if (rect.top < 120 && rect.right > maxRight) {
                maxRight = rect.right;
                rightmost = btn;
            }
        }
        return rightmost;
    }

    function waitForConfirm(timeout = 4000) {
        return new Promise(resolve => {
            const check = () => {
                const dialog = document.querySelector('[role="dialog"]');
                if (!dialog) return null;
                const buttons = dialog.querySelectorAll('button');
                for (const btn of buttons) {
                    const text = btn.textContent.trim();
                    if (text === "Sil" || text === "Delete" || text === "Sohbeti sil" || text === "Delete chat") {
                        return btn;
                    }
                }
                return null;
            };

            const found = check();
            if (found) return resolve(found);

            const obs = new MutationObserver(() => {
                const f = check();
                if (f) { obs.disconnect(); resolve(f); }
            });
            obs.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => { obs.disconnect(); resolve(check()); }, timeout);
        });
    }

    function goBack() {
        const back =
            document.querySelector('svg[aria-label="Geri"]')?.closest('[role="button"]') ||
            document.querySelector('svg[aria-label="Back"]')?.closest('[role="button"]') ||
            document.querySelector('svg[aria-label="Geri"]')?.closest('button') ||
            document.querySelector('svg[aria-label="Back"]')?.closest('button');
        if (back) back.click();
    }

    function pressEscape() {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true }));
    }
})();
