import createPresageModule from "./vendor/libpresage.js";

const draft = document.querySelector("#draft");
const suggestionRoot = document.querySelector("#suggestions");
const status = document.querySelector("#engine-status");
const undoButton = document.querySelector("#undo");
const publishButton = document.querySelector("#continue-to-relay");
const publishHelp = document.querySelector("#publish-help");
const replyContext = document.querySelector("#reply-context");
const MAX_MESSAGE_BYTES = 1200;
const undoStack = [];
let engine;
let predictionTimer;
let shifted = false;
let symbols = false;
let lastDraftValue = "";

function setStatus(message, state = "loading") {
  status.textContent = message;
  status.dataset.state = state;
}

function saveUndoPoint() {
  if (undoStack.at(-1) !== draft.value) undoStack.push(draft.value);
  if (undoStack.length > 50) undoStack.shift();
  undoButton.disabled = undoStack.length === 0;
}

function updateDraftCount() {
  const count = Array.from(draft.value).length;
  const bytes = new TextEncoder().encode(draft.value).byteLength;
  document.querySelector("#draft-count").textContent = `${count} character${count === 1 ? "" : "s"} · ${bytes}/${MAX_MESSAGE_BYTES} UTF-8 bytes`;
  publishButton.disabled = bytes === 0 || bytes > MAX_MESSAGE_BYTES;
  publishHelp.textContent = bytes > MAX_MESSAGE_BYTES
    ? `This message is ${bytes - MAX_MESSAGE_BYTES} UTF-8 bytes over Relay’s ${MAX_MESSAGE_BYTES}-byte limit.`
    : bytes === 0
      ? "Enter a message to continue."
      : "Your draft stays here until you choose Continue.";
}

function insertText(value) {
  const start = draft.selectionStart;
  const end = draft.selectionEnd;
  const proposed = draft.value.slice(0, start) + value + draft.value.slice(end);
  if (Array.from(proposed).length > 1200) return;
  saveUndoPoint();
  draft.value = proposed;
  draft.setSelectionRange(start + value.length, start + value.length);
  draft.focus();
  onDraftChanged();
}

function deleteBackward() {
  const start = draft.selectionStart;
  const end = draft.selectionEnd;
  if (start === 0 && end === 0) return;
  saveUndoPoint();
  if (start !== end) {
    draft.setRangeText("", start, end, "start");
  } else {
    const before = Array.from(draft.value.slice(0, start));
    before.pop();
    const replacement = before.join("") + draft.value.slice(end);
    const next = before.join("").length;
    draft.value = replacement;
    draft.setSelectionRange(next, next);
  }
  draft.focus();
  onDraftChanged();
}

function acceptSuggestion(text) {
  const cursor = draft.selectionStart;
  if (cursor !== draft.selectionEnd) {
    draft.setRangeText("", cursor, draft.selectionEnd, "start");
  }
  const before = draft.value.slice(0, draft.selectionStart);
  const after = draft.value.slice(draft.selectionEnd);
  const match = before.match(/[^\s]*$/u);
  const partial = match?.[0] ?? "";
  const prefix = before.slice(0, before.length - partial.length);
  const proposed = prefix + text + (after.length === 0 && !/^\s/u.test(text) ? " " : "") + after;
  if (Array.from(proposed).length > 1200) return;
  saveUndoPoint();
  const position = prefix.length + text.length + (after.length === 0 && !/^\s/u.test(text) ? 1 : 0);
  draft.value = proposed;
  draft.setSelectionRange(position, position);
  draft.focus();
  onDraftChanged();
}

function renderSuggestions(predictions) {
  suggestionRoot.replaceChildren();
  for (const candidate of predictions.slice(0, 5)) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = candidate;
    button.setAttribute("aria-label", `Use suggestion ${candidate}`);
    button.addEventListener("click", () => acceptSuggestion(candidate));
    suggestionRoot.append(button);
  }
}

function predict() {
  clearTimeout(predictionTimer);
  predictionTimer = setTimeout(() => {
    if (!engine) return;
    if (draft.selectionStart !== draft.selectionEnd || draft.selectionStart !== draft.value.length) {
      renderSuggestions([]);
      return;
    }
    try {
      const context = draft.value.slice(-512);
      engine.callback.pastStream = context;
      const rows = engine.instance.predictWithProbability();
      const results = [];
      for (let index = 0; index < rows.size(); index += 1) {
        const raw = rows.get(index).prediction;
        let value = raw;
        try {
          const parsed = JSON.parse(raw);
          if (typeof parsed === "string") value = parsed;
        } catch {}
        value = value.trim();
        if (value && !results.includes(value)) results.push(value);
      }
      renderSuggestions(results);
    } catch (error) {
      renderSuggestions([]);
      setStatus(`Prediction error: ${error instanceof Error ? error.message : "unknown error"}`, "error");
    }
  }, 40);
}

function onDraftChanged() {
  updateDraftCount();
  lastDraftValue = draft.value;
  predict();
}

function addKey(label, action, { wide = false, space = false, pressed = false } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `key${wide ? " wide" : ""}${space ? " space" : ""}`;
  button.textContent = label;
  button.setAttribute("aria-label", label === "⌫" ? "Backspace" : label === "Space" ? "Space" : label);
  if (pressed) button.setAttribute("aria-pressed", "true");
  button.addEventListener("click", action);
  return button;
}

function buildKeyboard() {
  const root = document.querySelector("#keyboard");
  root.replaceChildren();
  const rows = symbols ? ["1234567890", "@#$%&-*+(", ")_!?':;\"/"] : ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
  for (const letters of rows) {
    const row = document.createElement("div");
    row.className = "key-row";
    if (!symbols && letters.startsWith("z")) {
      row.append(addKey("⇧", () => { shifted = !shifted; buildKeyboard(); }, { wide: true, pressed: shifted }));
    }
    for (const character of letters) {
      const label = shifted && /[a-z]/u.test(character) ? character.toUpperCase() : character;
      row.append(addKey(label, () => {
        insertText(label);
        if (shifted) { shifted = false; buildKeyboard(); }
      }));
    }
    if (letters.startsWith("z") || (symbols && letters.startsWith(")"))) row.append(addKey("⌫", deleteBackward, { wide: true }));
    root.append(row);
  }
  const controls = document.createElement("div");
  controls.className = "key-row";
  controls.append(addKey(symbols ? "ABC" : "?123", () => { symbols = !symbols; shifted = false; buildKeyboard(); }, { wide: true }));
  controls.append(addKey(",", () => insertText(",")));
  controls.append(addKey("Space", () => insertText(" "), { space: true }));
  controls.append(addKey(".", () => insertText(".")));
  controls.append(addKey("↵", () => insertText("\n"), { wide: true }));
  root.append(controls);
}

draft.addEventListener("beforeinput", () => {
  if (draft.value !== lastDraftValue) lastDraftValue = draft.value;
  saveUndoPoint();
});
draft.addEventListener("input", onDraftChanged);
draft.addEventListener("click", predict);
draft.addEventListener("keyup", predict);
undoButton.addEventListener("click", () => {
  if (!undoStack.length) return;
  draft.value = undoStack.pop();
  draft.focus();
  draft.setSelectionRange(draft.value.length, draft.value.length);
  undoButton.disabled = undoStack.length === 0;
  onDraftChanged();
});
document.querySelector("#clear").addEventListener("click", () => {
  if (!draft.value) return;
  saveUndoPoint();
  draft.value = "";
  draft.focus();
  onDraftChanged();
});

const query = new URLSearchParams(location.search);
const requestedReply = query.get("reply_to");
const replyTo = requestedReply && /^IARC-M-[0-9a-f-]{36}$/iu.test(requestedReply) ? requestedReply : null;
if (replyTo) {
  replyContext.hidden = false;
  replyContext.textContent = `This message will be a reply to ${replyTo}. The relationship becomes public only if you publish.`;
}

publishButton.addEventListener("click", () => {
  const bytes = new TextEncoder().encode(draft.value).byteLength;
  if (bytes === 0 || bytes > MAX_MESSAGE_BYTES) return;
  const destination = new URL("/quick/preview", location.origin);
  destination.searchParams.set("message", draft.value);
  if (replyTo) destination.searchParams.set("reply_to", replyTo);
  location.assign(destination);
});

buildKeyboard();
updateDraftCount();

try {
  setStatus("Loading English model into this browser…");
  const module = await createPresageModule({
    locateFile: (path) => new URL(
      path.endsWith(".data") ? `./vendor/third_party/libpresage/${path}` : `./vendor/${path}`,
      import.meta.url,
    ).href,
    setStatus: (message) => {
      if (typeof message === "string" && message.startsWith("Downloading data")) setStatus(message);
    },
  });
  const callback = {
    pastStream: "",
    get_past_stream() { return this.pastStream; },
    get_future_stream() { return ""; },
  };
  const callbackImpl = module.PresageCallback.implement(callback);
  const instance = new module.Presage(callbackImpl, "resources_js/en_US/presage.xml");
  instance.config("Presage.Selector.SUGGESTIONS", "5");
  instance.config("Presage.ContextTracker.PREFIX_ONLY_MODE", "no");
  engine = { callback, instance };
  setStatus("English predictor ready; draft stays in this browser.", "ready");
  predict();
} catch (error) {
  console.error("Local prediction engine failed to initialize", error);
  setStatus("Could not load the local English predictor. See details below or use the keys without suggestions.", "error");
  const help = document.querySelector("#suggestion-help");
  help.textContent = error instanceof Error ? error.message : "The local prediction engine could not start.";
}
