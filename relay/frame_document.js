const encoder = new TextEncoder();
const FORBIDDEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;
const MAX_BYTES = 1_200;
const SLOT_ID = /^[a-z][a-z0-9_-]{0,31}$/u;

// Hand-authored sentence structures. Labels organize visible links; users do
// not have to visit a separate intent-selection page first.
export const FRAME_CATALOGUE_VERSION = "frame-catalogue-0.1.0";
export const FRAME_CATALOGUE = Object.freeze([
  { id: "hello", group: "Open", label: "Hello.", segments: [{ text: "Hello." }] },
  { id: "good-day", group: "Open", label: "Good morning.", segments: [{ text: "Good morning." }] },
  { id: "ask-status", group: "Ask", label: "What is the status of [item]?", segments: [{ text: "What is the status of " }, { slot: "item", label: "item" }, { text: "?" }] },
  { id: "ask-where", group: "Ask", label: "Where is [item]?", segments: [{ text: "Where is " }, { slot: "item", label: "item" }, { text: "?" }] },
  { id: "ask-why", group: "Ask", label: "Why did [subject] [action]?", segments: [{ text: "Why did " }, { slot: "subject", label: "subject" }, { text: " " }, { slot: "action", label: "action" }, { text: "?" }] },
  { id: "request-could", group: "Request", label: "Could you [action]?", segments: [{ text: "Could you " }, { slot: "action", label: "action" }, { text: "?" }] },
  { id: "request-please", group: "Request", label: "Please [action].", segments: [{ text: "Please " }, { slot: "action", label: "action" }, { text: "." }] },
  { id: "request-need", group: "Request", label: "I need [item].", segments: [{ text: "I need " }, { slot: "item", label: "item" }, { text: "." }] },
  { id: "inform-topic-state", group: "Inform", label: "The [topic] is [state].", segments: [{ text: "The " }, { slot: "topic", label: "topic" }, { text: " is " }, { slot: "state", label: "state" }, { text: "." }] },
  { id: "inform-action", group: "Inform", label: "I will [action].", segments: [{ text: "I will " }, { slot: "action", label: "action" }, { text: "." }] },
  { id: "clarify-meant", group: "Clarify", label: "I meant [correction].", segments: [{ text: "I meant " }, { slot: "correction", label: "correction" }, { text: "." }] },
  { id: "clarify-not", group: "Clarify", label: "The [topic] is not [state].", segments: [{ text: "The " }, { slot: "topic", label: "topic" }, { text: " is not " }, { slot: "state", label: "state" }, { text: "." }] },
  { id: "respond-that", group: "Respond", label: "That [topic] works for me.", segments: [{ text: "That " }, { slot: "topic", label: "topic" }, { text: " works for me." }] },
  { id: "respond-cannot", group: "Respond", label: "I cannot [action].", segments: [{ text: "I cannot " }, { slot: "action", label: "action" }, { text: "." }] },
  { id: "thanks-for", group: "Thanks and apologies", label: "Thanks for [event].", segments: [{ text: "Thanks for " }, { slot: "event", label: "event" }, { text: "." }] },
  { id: "sorry-about", group: "Thanks and apologies", label: "Sorry about [event].", segments: [{ text: "Sorry about " }, { slot: "event", label: "event" }, { text: "." }] },
  { id: "free-text", group: "Other", label: "Write a sentence from exact characters", segments: [{ slot: "text", label: "sentence" }] },
]);

const frames = new Map(FRAME_CATALOGUE.map((frame) => [frame.id, frame]));
const byteLength = (text) => encoder.encode(text).length;

function assertText(text, label = "Slot text") {
  if (typeof text !== "string" || !text || FORBIDDEN.test(text) || byteLength(text) > MAX_BYTES) {
    throw new TypeError(`${label} is empty, invalid, or too long.`);
  }
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i);
    if (unit >= 0xD800 && unit <= 0xDBFF) {
      const next = text.charCodeAt(i + 1);
      if (!(next >= 0xDC00 && next <= 0xDFFF)) throw new TypeError(`${label} contains invalid Unicode.`);
      i += 1;
    } else if (unit >= 0xDC00 && unit <= 0xDFFF) throw new TypeError(`${label} contains invalid Unicode.`);
  }
}

export function createFrameBlock(frameId) {
  const frame = frames.get(frameId);
  if (!frame) throw new TypeError("Choose one of the displayed sentence frames.");
  const slots = {};
  for (const segment of frame.segments) if (segment.slot) slots[segment.slot] = { label: segment.label, value: "", required: true };
  const definition = structuredClone({ ...frame, version: FRAME_CATALOGUE_VERSION });
  return { frame_id: frame.id, definition, slots, active_slot: Object.keys(slots)[0] || null };
}

function validateFrameBlock(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) throw new TypeError("Frame draft is invalid.");
  const definition = document.definition;
  if (!definition || typeof definition !== "object" || definition.id !== document.frame_id || typeof definition.label !== "string" || definition.label.length > 180 || typeof definition.group !== "string" || definition.group.length > 80 || !/^frame-catalogue-\d+\.\d+\.\d+$/u.test(definition.version) || !Array.isArray(definition.segments) || !definition.segments.length || definition.segments.length > 64 || !document.slots || typeof document.slots !== "object" || Array.isArray(document.slots)) throw new TypeError("Frame draft is invalid.");
  for (const segment of definition.segments) {
    if (!segment || typeof segment !== "object" || Array.isArray(segment) || (typeof segment.text === "string" && Object.keys(segment).length === 1 && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(segment.text)) || (typeof segment.slot === "string" && typeof segment.label === "string" && Object.keys(segment).length === 2 && /^[a-z][a-z0-9_-]{0,31}$/u.test(segment.slot) && segment.label.length <= 80)) continue;
    throw new TypeError("Frame definition is invalid.");
  }
  const declared = definition.segments.filter((segment) => segment.slot).map((segment) => segment.slot);
  if (Object.keys(document.slots).length !== declared.length || Object.keys(document.slots).some((id) => !declared.includes(id))) throw new TypeError("Frame slot set does not match its catalogue entry.");
  for (const id of declared) {
    const slot = document.slots[id];
    if (!slot || slot.label !== definition.segments.find((segment) => segment.slot === id).label || typeof slot.value !== "string" || slot.required !== true) throw new TypeError("Frame slot state is invalid.");
    if (slot.value) assertText(slot.value);
  }
  if (document.active_slot !== null && !declared.includes(document.active_slot)) throw new TypeError("Active frame slot is invalid.");
  return document;
}

export function createFrameDocument(frameId) {
  return { version: 1, catalogue: FRAME_CATALOGUE_VERSION, frames: [createFrameBlock(frameId)] };
}

export function validateFrameDocument(document) {
  if (!document || typeof document !== "object" || Array.isArray(document) || document.version !== 1 || !/^frame-catalogue-\d+\.\d+\.\d+$/u.test(document.catalogue) || !Array.isArray(document.frames) || document.frames.length > 128) throw new TypeError("Frame draft version is invalid.");
  for (const frame of document.frames) validateFrameBlock(frame);
  return document;
}

export function renderFrameDocument(document, { placeholders = true } = {}) {
  validateFrameDocument(document);
  const renderedFrames = document.frames.map((block) => {
    const frame = block.definition;
    let text = "";
    let stored = "";
    for (const segment of frame.segments) {
      if (segment.text !== undefined) { text += segment.text; stored += segment.text; }
      else {
        const value = block.slots[segment.slot].value;
        text += value || (placeholders ? `⟦${segment.label}⟧` : "");
        stored += value;
      }
    }
    return { text, stored };
  });
  const join = (key) => renderedFrames.reduce((result, next) => {
    const value = next[key];
    if (!result || !value) return result + value;
    const separator = /\s$/u.test(result) || /^\s/u.test(value) || /^[,.;:!?)]/u.test(value) ? "" : " ";
    return result + separator + value;
  }, "");
  const text = join("text");
  const stored = join("stored");
  if (byteLength(stored) > MAX_BYTES || FORBIDDEN.test(stored)) throw new RangeError(`The message would exceed Relay's ${MAX_BYTES}-byte limit.`);
  return text;
}

export function fillFrameSlot(document, slotId, value, frameIndex = document.frames.length - 1) {
  validateFrameDocument(document);
  const current = document.frames[frameIndex];
  if (!current || !SLOT_ID.test(slotId) || !Object.hasOwn(current.slots, slotId)) throw new TypeError("Choose a slot shown in the current frame.");
  assertText(value);
  const next = structuredClone(document);
  next.frames[frameIndex].slots[slotId].value = value;
  const remaining = Object.keys(next.frames[frameIndex].slots).find((id) => !next.frames[frameIndex].slots[id].value);
  next.frames[frameIndex].active_slot = remaining || slotId;
  const rendered = renderFrameDocument(next);
  return { document: next, rendered_text: rendered, complete: frameIsComplete(next) };
}

export function frameIsComplete(document) {
  validateFrameDocument(document);
  return document.frames.length > 0 && document.frames.every((frame) => Object.values(frame.slots).every((slot) => slot.value.length > 0));
}

export function framePlainText(document) {
  if (!frameIsComplete(document)) throw new TypeError("Fill every required slot or discard this frame before continuing as ordinary text.");
  return renderFrameDocument(document, { placeholders: false });
}

export function convertFrameToPlainText(document) {
  const text = framePlainText(document);
  const plain = createFrameDocument("free-text");
  return fillFrameSlot(plain, "text", text);
}

export function appendFrameSlotText(document, slotId, addition, frameIndex = document.frames.length - 1, { word = false } = {}) {
  validateFrameDocument(document);
  assertText(addition);
  const block = document.frames[frameIndex];
  if (!block || !Object.hasOwn(block.slots, slotId)) throw new TypeError("Choose a slot shown in the current frame.");
  const prior = block.slots[slotId].value;
  const separator = word && prior && !/\s$/u.test(prior) ? " " : "";
  return fillFrameSlot(document, slotId, `${prior}${separator}${addition}`, frameIndex);
}

export function backspaceFrameSlot(document, slotId, frameIndex = document.frames.length - 1) {
  validateFrameDocument(document);
  const block = document.frames[frameIndex];
  if (!block || !Object.hasOwn(block.slots, slotId)) throw new TypeError("Choose a slot shown in the current frame.");
  const value = block.slots[slotId].value;
  if (!value) return { document, rendered_text: renderFrameDocument(document), complete: frameIsComplete(document) };
  const shortened = [...value].slice(0, -1).join("");
  const next = structuredClone(document);
  next.frames[frameIndex].slots[slotId].value = shortened;
  return { document: next, rendered_text: renderFrameDocument(next), complete: frameIsComplete(next) };
}

export function appendFrame(document, frameId) {
  if (document.frames.length && !frameIsComplete(document)) throw new TypeError("Complete the current frame before adding another sentence.");
  const next = structuredClone(document);
  next.frames.push(createFrameBlock(frameId));
  validateFrameDocument(next);
  const rendered = renderFrameDocument(next);
  return { document: next, rendered_text: rendered, complete: false };
}

export function changeLastFrame(document, frameId) {
  validateFrameDocument(document);
  if (!document.frames.length) return createFrameDocument(frameId);
  const next = structuredClone(document);
  next.frames[next.frames.length - 1] = createFrameBlock(frameId);
  validateFrameDocument(next);
  return { document: next, rendered_text: renderFrameDocument(next), complete: frameIsComplete(next) };
}
