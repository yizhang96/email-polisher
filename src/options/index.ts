const k = document.getElementById("k") as HTMLInputElement;
const ok = document.getElementById("ok") as HTMLElement;
const save = document.getElementById("save") as HTMLButtonElement;
const status = document.getElementById("status") as HTMLElement;

(async () => {
  const v = (await chrome.storage.local.get("openaiKey")).openaiKey as string | undefined;
  if (v) {
    k.value = v;
  } else {
    status.textContent = "OpenAI API key required to use the extension.";
    status.style.display = "block";
    k.focus();
  }
})();

save.addEventListener("click", async () => {
  const key = k.value.trim();
  if (!key) {
    status.textContent = "Please enter your OpenAI API key.";
    status.style.display = "block";
    k.focus();
    return;
  }
  if (!key.startsWith("sk-")) {
    status.textContent = "That key doesn't look valid (it should start with \"sk-\").";
    status.style.display = "block";
    k.focus();
    return;
  }
  await chrome.storage.local.set({ openaiKey: key });
  status.style.display = "none";
  ok.style.display = "inline-block";
  setTimeout(() => (ok.style.display = "none"), 1500);
});
