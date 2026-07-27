// Browser speech-to-text + text-to-speech helpers.

export function makeRecognizer(onText, onEnd) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const r = new SR();
  r.continuous = false; r.interimResults = false; r.lang = "en-US";
  r.onresult = (e) => onText(Array.from(e.results).map((x) => x[0].transcript).join(" "));
  r.onend = onEnd; r.onerror = onEnd;
  return r;
}

export function speak(text) {
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02;
    window.speechSynthesis.speak(u);
  } catch {}
}
