function addBulkDeleteButton() {
  if (!window.location.pathname.startsWith("/direct/inbox")) return;
  if (document.querySelector("#bulk-delete-dm-btn")) return;

  const dmList = document.querySelector('div[role="button"][tabindex="0"]')
    ?.parentElement?.parentElement;

  if (!dmList) {
    console.log("DM listesi bulunamadı, tekrar deneniyor...");
    return;
  }

  const btn = document.createElement("button");
  btn.id = "bulk-delete-dm-btn";
  btn.innerText = "Tüm DM'leri Sil";
  btn.style.cssText = `
        background: linear-gradient(45deg, #ed4956, #d6249f);
        color: white;
        border: none;
        border-radius: 8px;
        padding: 12px 20px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        margin: 10px 0 10px 10px;
        z-index: 9999;
        display: block;
        box-shadow: 0 2px 8px rgba(237, 73, 86, 0.3);
        transition: all 0.2s ease;
    `;

  btn.addEventListener("mouseenter", () => {
    btn.style.transform = "translateY(-1px)";
    btn.style.boxShadow = "0 4px 12px rgba(237, 73, 86, 0.4)";
  });

  btn.addEventListener("mouseleave", () => {
    btn.style.transform = "translateY(0)";
    btn.style.boxShadow = "0 2px 8px rgba(237, 73, 86, 0.3)";
  });

  btn.onclick = startBulkDelete;

  const dmScope =
    document.querySelector(
      ".xb57i2i.x1q594ok.x5lxg6s.x78zum5.xdt5ytf.x6ikm8r.x1ja2u2z.x1pq812k.x1rohswg.xfk6m8.x1yqm8si.xjx87ck.xx8ngbg.xwo3gff.x1n2onr6.x1oyok0e.x1odjw0f.x1e4zzel.x1xzczws"
    ) ||
    document.querySelector(
      ".x2atdfe.xb57i2i.x1q594ok.x5lxg6s.x78zum5.xdt5ytf.x6ikm8r.x1n2onr6.x1ja2u2z.x1odjw0f.x1e4zzel.x1xzczws"
    );

  const allButtons = document.querySelectorAll(
    'div[role="button"][tabindex="0"]'
  );
  const chatRows = Array.from(allButtons).filter(function (el) {
    if (el.closest('div[role="dialog"]')) return false;
    if (
      dmScope &&
      !el.closest(
        ".x2atdfe.xb57i2i.x1q594ok.x5lxg6s.x78zum5.xdt5ytf.x6ikm8r.x1n2onr6.x1ja2u2z.x1odjw0f.x1e4zzel.x1xzczws"
      )
    )
      return false;
    const hasTime = Boolean(el.querySelector("abbr"));
    const hasAvatar = Boolean(
      el.querySelector('img[width="56"], img[height="56"]')
    );
    const isVisible = !!el.offsetParent;
    return hasTime && hasAvatar && isVisible;
  });

  btn.style.width = "100%";
  btn.style.marginLeft = "0";
  btn.style.marginRight = "0";

  if (dmScope) {
    dmScope.insertBefore(btn, dmScope.firstChild);
  } else {
    let mesajlarBasligi = Array.from(
      document.querySelectorAll("span,div,h2,h3")
    ).find((el) => el.textContent.trim() === "Mesajlar");
    if (mesajlarBasligi) {
      mesajlarBasligi.parentElement.insertBefore(
        btn,
        mesajlarBasligi.nextSibling
      );
    } else {
      const dmList = document.querySelector('div[role="button"][tabindex="0"]')
        ?.parentElement?.parentElement;
      if (dmList) dmList.prepend(btn);
    }
  }
}

function startBulkDelete() {
  if (
    !confirm(
      "⚠️ DİKKAT: Tüm DM'ler silinecek!\n\nBu işlem geri alınamaz. Devam etmek istiyor musunuz?"
    )
  )
    return;

  localStorage.setItem("autoBulkDeleteDMs", "1");
  bulkDeleteDMs();
}

function bulkDeleteDMs() {
  let deleteCount = 0;

  function deleteNext() {
    const chatRows = document.querySelectorAll(
      '.x13dflua.x19991ni div[role="button"][tabindex="0"]'
    );

    if (!chatRows.length) {
      alert(`✅ İşlem tamamlandı! ${deleteCount} sohbet silindi.`);
      localStorage.removeItem("autoBulkDeleteDMs");
      return;
    }

    const chat = chatRows[0];
    chat.click();

    setTimeout(() => {
      const infoBtn = findInfoButton();

      if (infoBtn) {
        infoBtn.click();
        setTimeout(() => {
          const deleteBtn = findDeleteButton();
          if (deleteBtn) {
            deleteBtn.click();
            setTimeout(() => {
              const confirmBtn = findConfirmButton();
              if (confirmBtn) {
                confirmBtn.click();
                deleteCount++;
                setTimeout(() => {
                  deleteNext();
                }, 1600);
              } else {
                console.log(
                  "Onay butonu bulunamadı, sonraki sohbete geçiliyor..."
                );
                deleteNext();
              }
            }, 700);
          } else {
            console.log(
              "Silme butonu bulunamadı, sonraki sohbete geçiliyor..."
            );
            deleteNext();
          }
        }, 700);
      } else {
        console.log("Bilgi butonu bulunamadı, sonraki sohbete geçiliyor...");
        deleteNext();
      }
    }, 700);
  }

  deleteNext();
}

function findInfoButton() {
  const selectors = [
    'div[role="button"][tabindex="0"] svg[aria-label="Konuşma Bilgileri"]',
    'div[role="button"][tabindex="0"] svg[aria-label="Chat info"]',
    'div[role="button"] svg[aria-label*="Bilgi"]',
    'div[role="button"] svg[aria-label*="Info"]',
    'div[role="button"] svg[data-testid="info"]',
  ];

  for (const selector of selectors) {
    const svg = document.querySelector(selector);
    if (svg) {
      return svg.closest('div[role="button"]');
    }
  }

  const buttons = document.querySelectorAll('div[role="button"]');
  for (const button of buttons) {
    if (
      button.textContent.includes("Bilgi") ||
      button.textContent.includes("Info")
    ) {
      return button;
    }
  }

  return null;
}

function findDeleteButton() {
  const selectors = [
    'span:contains("Sohbeti sil")',
    'span:contains("Delete chat")',
    'button:contains("Sohbeti sil")',
    'button:contains("Delete chat")',
    'div[role="button"]:contains("Sohbeti sil")',
    'div[role="button"]:contains("Delete chat")',
  ];

  const elements = document.querySelectorAll(
    'span, button, div[role="button"]'
  );
  for (const element of elements) {
    const text = element.textContent.trim();
    if (
      text === "Sohbeti sil" ||
      text === "Delete chat" ||
      text === "Sil" ||
      text === "Delete"
    ) {
      return element.closest('div[role="button"]') || element;
    }
  }

  return null;
}

function findConfirmButton() {
  const selectors = [
    'div[role="dialog"] button:contains("Sil")',
    'div[role="dialog"] button:contains("Delete")',
    'div[role="dialog"] button:contains("Onayla")',
    'div[role="dialog"] button:contains("Confirm")',
  ];

  const dialog = document.querySelector('div[role="dialog"]');
  if (dialog) {
    const buttons = dialog.querySelectorAll("button");
    for (const button of buttons) {
      const text = button.textContent.trim();
      if (
        text === "Sil" ||
        text === "Delete" ||
        text === "Onayla" ||
        text === "Confirm"
      ) {
        return button;
      }
    }
  }

  return null;
}

if (localStorage.getItem("autoBulkDeleteDMs") === "1") {
  setTimeout(() => {
    bulkDeleteDMs();
  }, 2000);
}

setInterval(addBulkDeleteButton, 1500);
