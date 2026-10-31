// Clicking the toolbar icon opens the backup control page in its OWN small window,
// so the Google Photos tab stays visible. Chrome pauses scrolling and loading in
// hidden tabs, which is what stalls a long backup.
chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL("backup.html");
  const existing = await chrome.tabs.query({ url });
  if (existing.length) {
    await chrome.tabs.update(existing[0].id, { active: true });
    await chrome.windows.update(existing[0].windowId, { focused: true });
  } else {
    await chrome.windows.create({ url, type: "popup", width: 560, height: 720 });
  }
});

// Keep the screen on (and the Mac awake) while a backup runs. "display" also prevents
// the screen saver and screen lock that follow display sleep.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "keepAwake") {
    if (msg.on) chrome.power.requestKeepAwake("display");
    else chrome.power.releaseKeepAwake();
  }
});
