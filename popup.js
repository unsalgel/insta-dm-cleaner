// Popup.js — Speed Settings Controller

document.addEventListener("DOMContentLoaded", () => {
    // Load version from manifest.json
    const ver = document.getElementById("app-version");
    if (ver) ver.textContent = "v" + chrome.runtime.getManifest().version;

    // Load saved speed setting
    chrome.storage.local.get(["dmCleanerSpeed"], (data) => {
        const speed = data.dmCleanerSpeed || "normal";
        setActiveSpeed(speed);
    });

    // Speed button click handlers
    document.querySelectorAll(".speed-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const speed = btn.dataset.speed;
            chrome.storage.local.set({ dmCleanerSpeed: speed });
            setActiveSpeed(speed);
        });
    });
});

function setActiveSpeed(speed) {
    // Remove active class from all buttons
    document.querySelectorAll(".speed-btn").forEach((b) => b.classList.remove("active"));

    // Add active class to selected button
    const activeBtn = document.querySelector(`.speed-btn[data-speed="${speed}"]`);
    if (activeBtn) activeBtn.classList.add("active");

    // Show/hide fast mode warning
    const warning = document.getElementById("speed-warning");
    if (warning) {
        if (speed === "fast") {
            warning.classList.add("visible");
        } else {
            warning.classList.remove("visible");
        }
    }
}
