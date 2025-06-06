// Instagram DM toplu silici

function addBulkDeleteButton() {
  // Sadece DM sayfasında çalışsın
  if (!window.location.pathname.startsWith("/direct/inbox")) return;
  if (document.querySelector("#bulk-delete-dm-btn")) return;

  // DM listesinin üstüne ekle
  const dmList = document.querySelector('div[aria-label="Chats"]');
  if (!dmList) return;

  const btn = document.createElement("button");
  btn.id = "bulk-delete-dm-btn";
  btn.innerText = "Tüm DM'leri Sil";
  btn.style.cssText = `
        background: #ed4956;
        color: white;
        border: none;
        border-radius: 6px;
        padding: 10px 18px;
        font-size: 16px;
        font-weight: bold;
        cursor: pointer;
        margin: 10px 0 10px 10px;
        z-index: 9999;
        display: block;
    `;
  btn.onclick = startBulkDelete;
  dmList.prepend(btn);
}

function startBulkDelete() {
  if (
    !confirm(
      "Tüm DM'ler silinecek. Devam etmek istiyor musunuz? Bu işlem geri alınamaz!"
    )
  )
    return;
  bulkDeleteDMs();
}

function bulkDeleteDMs() {
  function deleteNext() {
    // Her seferinde güncel DM listesini al
    const chatRows = document.querySelectorAll(
      'div[aria-label="Chats"] [role="button"][tabindex="0"]'
    );
    if (!chatRows.length) {
      alert("Tüm DM'ler silindi veya silinecek başka sohbet kalmadı!");
      return;
    }
    const chat = chatRows[0];
    chat.click();
    setTimeout(() => {
      const infoBtn = Array.from(
        document.querySelectorAll(
          'div[role="button"][tabindex="0"] svg[aria-label="Konuşma Bilgileri"]'
        )
      ).map((svg) => svg.closest('div[role="button"]'))[0];
      if (infoBtn) {
        infoBtn.click();
        setTimeout(() => {
          const deleteBtn = Array.from(document.querySelectorAll("span")).find(
            (el) => el.textContent.trim() === "Sohbeti sil"
          );
          if (deleteBtn) {
            deleteBtn.closest('div[role="button"]').click();
            setTimeout(() => {
              const confirmBtn = Array.from(
                document.querySelectorAll('div[role="dialog"] button')
              ).find((el) => el.textContent.trim() === "Sil");
              if (confirmBtn) {
                confirmBtn.click();
                setTimeout(() => {
                  // Burada tekrar deleteNext çağrılır, böylece güncel DM listesiyle devam eder
                  deleteNext();
                }, 2000);
              } else {
                deleteNext();
              }
            }, 800);
          } else {
            deleteNext();
          }
        }, 800);
      } else {
        deleteNext();
      }
    }, 800);
  }
  deleteNext();
}

// Sayfa değiştikçe butonu tekrar ekle
setInterval(addBulkDeleteButton, 1500);
