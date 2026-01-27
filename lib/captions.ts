export interface CaptionSegment {
  text: string;
  start: number;
  end: number;
}

export interface CaptionClipInput {
  startTime: number;
  endTime: number;
  transcript: string;
  segments: CaptionSegment[];
  hook: string;
}

function escapeAssText(text: string): string {
  return text
    .replace(/\r?\n/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}")
    .replace(/,/g, "\\,");
}

function formatAssTime(seconds: number): string {
  const clamped = Math.max(seconds, 0);
  const hrs = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = Math.floor(clamped % 60);
  const centis = Math.floor((clamped - Math.floor(clamped)) * 100);
  return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

function buildWordTimings(
  segments: CaptionSegment[],
  clipStart: number,
  clipEnd: number,
  fallbackTranscript: string
): Array<{ word: string; start: number; end: number }> {
  const words: Array<{ word: string; start: number; end: number }> = [];
  const overlapping = segments.filter(
    (seg) => seg.end > clipStart && seg.start < clipEnd
  );

  if (overlapping.length === 0) {
    const fallbackWords = fallbackTranscript.split(/\s+/).filter(Boolean);
    const totalDuration = Math.max(clipEnd - clipStart, 0.1);
    const perWord = totalDuration / Math.max(fallbackWords.length, 1);
    return fallbackWords.map((word, index) => ({
      word,
      start: index * perWord,
      end: (index + 1) * perWord,
    }));
  }

  for (const seg of overlapping) {
    const segStart = Math.max(seg.start, clipStart);
    const segEnd = Math.min(seg.end, clipEnd);
    const segDuration = Math.max(segEnd - segStart, 0);
    const segWords = seg.text.split(/\s+/).filter(Boolean);
    if (segWords.length === 0 || segDuration <= 0) {
      continue;
    }
    const perWord = segDuration / segWords.length;
    segWords.forEach((word, index) => {
      const start = segStart + index * perWord;
      const end = start + perWord;
      words.push({
        word,
        start: start - clipStart,
        end: end - clipStart,
      });
    });
  }

  return words;
}

export function buildAssContentForClip(input: CaptionClipInput): string {
  const { startTime, endTime, transcript, segments, hook } = input;
  const words = buildWordTimings(segments, startTime, endTime, transcript);
  const hookLines = wrapText(hook, 28);
  const hookText = hookLines.map((line) => escapeAssText(line)).join("\\N");

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "PlayResX: 1080",
    "PlayResY: 1920",
    "WrapStyle: 0",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: Words,DejaVu Sans,84,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,40,40,350,1",
    "Style: Hook,DejaVu Sans,84,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,8,80,80,120,1",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const events = words.map((entry) => {
    const start = formatAssTime(entry.start);
    const end = formatAssTime(entry.end);
    const text = escapeAssText(entry.word);
    return `Dialogue: 0,${start},${end},Words,,0,0,0,,${text}`;
  });

  const hookEvent = `Dialogue: 1,${formatAssTime(0)},${formatAssTime(Math.max(endTime - startTime, 0))},Hook,,0,0,0,,${hookText}`;

  return [...header, ...events, hookEvent].join("\n");
}
