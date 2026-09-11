import { useCallback, useEffect, useRef, useState } from "react";

type RecognitionAlternative = { transcript: string };
type RecognitionResult = {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: RecognitionAlternative;
};
type RecognitionEvent = {
  readonly results: {
    readonly length: number;
    readonly [index: number]: RecognitionResult;
  };
};
type RecognitionErrorEvent = { error: string };
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionConstructor = new () => Recognition;
type VoiceWindow = Window & typeof globalThis & {
  SpeechRecognition?: RecognitionConstructor;
  webkitSpeechRecognition?: RecognitionConstructor;
};

export type AssistantVoiceActivity = "idle" | "listening" | "waiting" | "speaking";

export interface UseAssistantVoiceOptions {
  language?: string;
  onTranscriptionChange: (transcript: string) => void;
  onTranscriptionSubmit: (transcript: string) => void;
  onError: (message: string) => void;
}

const LANGUAGE_BY_BASE: Record<string, string> = {
  ar: "ar-SA",
  de: "de-DE",
  en: "en-IN",
  es: "es-ES",
  fr: "fr-FR",
  hi: "hi-IN",
  ja: "ja-JP",
  pt: "pt-BR",
  zh: "zh-CN",
};

export function voiceLanguage(language = "en"): string {
  const normalized = language.trim().replace("_", "-");
  if (normalized.includes("-")) return normalized;
  return LANGUAGE_BY_BASE[normalized.toLowerCase()] || "en-IN";
}

export function assistantTextForSpeech(markdown: string): string {
  return markdown
    .replace(/```(?:\w+)?\n?([\s\S]*?)```/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+[.)]\s+/gm, "")
    .replace(/^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/gm, " ")
    .replace(/^\s*\|\s?/gm, "")
    .replace(/\s?\|\s*$/gm, "")
    .replace(/\|/g, ", ")
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitSpeechText(text: string, maximumLength = 220): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const sentences = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [normalized];
  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (current) chunks.push(current);
    current = "";
  };

  for (const sentenceValue of sentences) {
    const sentence = sentenceValue.trim();
    if (!sentence) continue;
    if (`${current} ${sentence}`.trim().length <= maximumLength) {
      current = `${current} ${sentence}`.trim();
      continue;
    }
    flush();
    if (sentence.length <= maximumLength) {
      current = sentence;
      continue;
    }
    for (const word of sentence.split(" ")) {
      if (word.length > maximumLength) {
        flush();
        for (let offset = 0; offset < word.length; offset += maximumLength) {
          const part = word.slice(offset, offset + maximumLength);
          if (part.length === maximumLength) chunks.push(part);
          else current = part;
        }
        continue;
      }
      if (`${current} ${word}`.trim().length > maximumLength) flush();
      current = `${current} ${word}`.trim();
    }
  }
  flush();
  return chunks;
}

function recognitionConstructor(): RecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const voiceWindow = window as VoiceWindow;
  return voiceWindow.SpeechRecognition || voiceWindow.webkitSpeechRecognition;
}

export function isAssistantVoiceSupported(): boolean {
  return Boolean(
    recognitionConstructor()
    && typeof window !== "undefined"
    && window.speechSynthesis
    && typeof SpeechSynthesisUtterance !== "undefined",
  );
}

function recognitionErrorMessage(error: string): string {
  if (error === "not-allowed" || error === "service-not-allowed") {
    return "Microphone access was denied. Allow microphone access in your browser and try again.";
  }
  if (error === "audio-capture") return "No microphone was detected. Check your audio input and try again.";
  if (error === "network") return "Voice recognition could not connect. Check your network and try again.";
  if (error === "no-speech") return "I didn't hear anything. Start voice mode and try speaking again.";
  return "Voice recognition stopped unexpectedly. Please try again.";
}

export function useAssistantVoice(options: UseAssistantVoiceOptions) {
  const [supported] = useState(isAssistantVoiceSupported);
  const [enabled, setEnabled] = useState(false);
  const [activity, setActivity] = useState<AssistantVoiceActivity>("idle");
  const enabledRef = useRef(false);
  const recognitionRef = useRef<Recognition | null>(null);
  const speechRunRef = useRef(0);
  const restartTimerRef = useRef<number | undefined>(undefined);
  const startListeningRef = useRef<() => void>(() => undefined);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const cancelRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    recognition?.abort();
  }, []);

  const stop = useCallback(() => {
    enabledRef.current = false;
    setEnabled(false);
    setActivity("idle");
    speechRunRef.current += 1;
    if (restartTimerRef.current !== undefined) window.clearTimeout(restartTimerRef.current);
    cancelRecognition();
    window.speechSynthesis?.cancel();
  }, [cancelRecognition]);

  const startListening = useCallback(() => {
    const RecognitionClass = recognitionConstructor();
    if (!supported || !RecognitionClass) {
      optionsRef.current.onError("Voice mode is not supported in this browser. Use the latest Chrome or Edge.");
      return;
    }

    speechRunRef.current += 1;
    if (restartTimerRef.current !== undefined) window.clearTimeout(restartTimerRef.current);
    window.speechSynthesis.cancel();
    cancelRecognition();

    const recognition = new RecognitionClass();
    recognitionRef.current = recognition;
    let finalTranscript = "";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = voiceLanguage(optionsRef.current.language);
    recognition.onstart = () => {
      if (recognitionRef.current === recognition) setActivity("listening");
    };
    recognition.onresult = (event) => {
      if (recognitionRef.current !== recognition) return;
      const finalParts: string[] = [];
      const interimParts: string[] = [];
      for (let index = 0; index < event.results.length; index++) {
        const result = event.results[index];
        const transcript = result[0]?.transcript?.trim();
        if (!transcript) continue;
        (result.isFinal ? finalParts : interimParts).push(transcript);
      }
      finalTranscript = finalParts.join(" ").trim().slice(0, 4000);
      const visibleTranscript = [...finalParts, ...interimParts].join(" ").trim().slice(0, 4000);
      if (visibleTranscript) optionsRef.current.onTranscriptionChange(visibleTranscript);
      if (finalTranscript) recognition.stop();
    };
    recognition.onerror = (event) => {
      if (recognitionRef.current !== recognition) return;
      recognitionRef.current = null;
      enabledRef.current = false;
      setEnabled(false);
      setActivity("idle");
      if (event.error !== "aborted") optionsRef.current.onError(recognitionErrorMessage(event.error));
    };
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      recognitionRef.current = null;
      if (!enabledRef.current) {
        setActivity("idle");
        return;
      }
      if (!finalTranscript) {
        enabledRef.current = false;
        setEnabled(false);
        setActivity("idle");
        optionsRef.current.onError("I didn't hear anything. Start voice mode and try speaking again.");
        return;
      }
      setActivity("waiting");
      optionsRef.current.onTranscriptionSubmit(finalTranscript);
    };

    enabledRef.current = true;
    setEnabled(true);
    setActivity("idle");
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      enabledRef.current = false;
      setEnabled(false);
      setActivity("idle");
      optionsRef.current.onError("The microphone could not start. Check browser permissions and try again.");
    }
  }, [cancelRecognition, supported]);
  startListeningRef.current = startListening;

  const speak = useCallback((markdown: string) => {
    if (!enabledRef.current || typeof window === "undefined") return;
    cancelRecognition();
    window.speechSynthesis.cancel();
    const chunks = splitSpeechText(assistantTextForSpeech(markdown));
    if (chunks.length === 0) {
      startListeningRef.current();
      return;
    }

    const run = ++speechRunRef.current;
    const language = voiceLanguage(optionsRef.current.language);
    const voice = window.speechSynthesis.getVoices().find((candidate) => (
      candidate.lang.toLowerCase().startsWith(language.split("-")[0].toLowerCase())
    ));
    setActivity("speaking");

    const speakChunk = (index: number) => {
      if (!enabledRef.current || speechRunRef.current !== run) return;
      const utterance = new SpeechSynthesisUtterance(chunks[index]);
      utterance.lang = language;
      utterance.rate = 1;
      utterance.pitch = 1;
      if (voice) utterance.voice = voice;
      utterance.onend = () => {
        if (!enabledRef.current || speechRunRef.current !== run) return;
        if (index + 1 < chunks.length) {
          speakChunk(index + 1);
          return;
        }
        setActivity("idle");
        restartTimerRef.current = window.setTimeout(() => startListeningRef.current(), 300);
      };
      utterance.onerror = (event) => {
        if (event.error === "canceled" || event.error === "interrupted") return;
        stop();
        optionsRef.current.onError("The assistant response could not be spoken. Please try voice mode again.");
      };
      window.speechSynthesis.speak(utterance);
    };
    speakChunk(0);
  }, [cancelRecognition, stop]);

  const toggle = useCallback(() => {
    if (enabledRef.current) stop();
    else startListening();
  }, [startListening, stop]);

  useEffect(() => () => {
    enabledRef.current = false;
    speechRunRef.current += 1;
    if (restartTimerRef.current !== undefined) window.clearTimeout(restartTimerRef.current);
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    recognition?.abort();
    window.speechSynthesis?.cancel();
  }, []);

  return { supported, enabled, activity, toggle, stop, speak };
}
