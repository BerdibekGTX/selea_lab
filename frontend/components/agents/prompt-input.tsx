"use client";
// Selea composer based on the beUI Prompt Input patterns.
/*
MIT License

Copyright (c) 2026 Saurabh Chauhan
Copyright (c) 2026 beUI and Saurabh

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

import { ArrowUp, ChevronDown, LoaderCircle, Mic, Plus, Square } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type FormEvent, type KeyboardEvent, type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SPRING_SWAP } from "@/lib/ease";
import { cn } from "@/lib/utils";

type Choice = { value: string; label: string };
type ChoiceGroup = {
  label: string;
  badge?: string;
  value: string;
  options: Choice[];
  onChange: (value: string) => void;
  disabled?: boolean;
};

type DictationSession = {
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
};

type SpeechWindow = Window & {
  SpeechRecognition?: new () => DictationSession;
  webkitSpeechRecognition?: new () => DictationSession;
};

type PromptInputProps = {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: (value: string) => void | Promise<void>;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  maxLength: number;
  loading?: boolean;
  disabled?: boolean;
  submitDisabled?: boolean;
  aboveInput?: ReactNode;
  modeControl: ReactNode;
  choices: ChoiceGroup[];
  actions: { label: string; icon: ReactNode; onSelect: () => void }[];
  onVoiceError: (message: string) => void;
};

export function PromptInput({
  value, onValueChange, onSubmit, inputRef, maxLength,
  loading = false, disabled = false, submitDisabled = false,
  aboveInput, modeControl, choices, actions, onVoiceError,
}: PromptInputProps) {
  const reduceMotion = useReducedMotion();
  const dictation = useRef<DictationSession | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const canSubmit = Boolean(value.trim()) && !disabled && !loading && !submitDisabled && !listening;
  const action = loading ? "sending" : "send";
  const transition = reduceMotion ? { duration: 0 } : SPRING_SWAP;

  useEffect(() => () => {
    const session = dictation.current;
    if (!session) return;
    dictation.current = null;
    session.onresult = null;
    session.onerror = null;
    session.onend = null;
    session.abort();
  }, []);

  function toggleDictation() {
    if (dictation.current) {
      dictation.current.stop();
      return;
    }

    const browser = window as SpeechWindow;
    const Recognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Recognition) {
      onVoiceError("Dictation is unavailable in this browser.");
      return;
    }

    const session = new Recognition();
    dictation.current = session;
    session.lang = navigator.language;
    session.onend = () => {
      dictation.current = null;
      setListening(false);
    };
    session.onerror = event => {
      if (event.error === "aborted") return;
      const denied = event.error === "not-allowed" || event.error === "service-not-allowed";
      onVoiceError(denied ? "Microphone permission is required for dictation." : "Dictation could not complete. Try again.");
    };
    session.onresult = event => {
      const transcript = Array.from(event.results, result => result[0]?.transcript ?? "").join(" ").trim();
      if (!transcript) return;
      const draft = inputRef.current?.value.trimEnd() ?? "";
      onValueChange([draft, transcript].filter(Boolean).join(" ").slice(0, maxLength));
      inputRef.current?.focus();
    };

    onVoiceError("");
    try {
      session.start();
      setListening(true);
    } catch {
      dictation.current = null;
      onVoiceError("Dictation could not start. Try again.");
    }
  }

  function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!canSubmit || listening) return;
    void onSubmit(value.trim());
    inputRef.current?.focus({ preventScroll: true });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  }

  return (
    <form onSubmit={submit} aria-label="Compose a message" className="studio-composer">
      {aboveInput && <div className="px-1">{aboveInput}</div>}
      <textarea
        ref={inputRef}
        aria-label="Message"
        placeholder="Ask anything"
        rows={3}
        maxLength={maxLength}
        value={value}
        disabled={disabled}
        onChange={event => onValueChange(event.target.value)}
        onKeyDown={handleKeyDown}
        className="studio-composer-field"
      />
      <div className="studio-composer-toolbar">
        <div className="flex items-center gap-1">
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" disabled={disabled || loading}
                aria-label="Add to prompt" className="size-9 text-muted-foreground">
                <motion.span aria-hidden="true" animate={{ rotate: menuOpen ? 45 : 0 }} transition={transition}>
                  <Plus className="size-[18px]" />
                </motion.span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" sideOffset={8}
              className="selea-prompt-menu w-44 rounded-xl p-1.5">
              {actions.map(item => (
                <DropdownMenuItem key={item.label} onSelect={item.onSelect}>
                  {item.icon}{item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button type="button" variant="ghost" size="icon" disabled={disabled || loading}
            aria-label={listening ? "Stop dictation" : "Dictate message"} onClick={toggleDictation}
            className={cn("size-9 text-muted-foreground", listening && "bg-accent text-foreground")}>
            {listening ? <Square className="size-3 fill-current" /> : <Mic className="size-4" />}
          </Button>
        </div>
        <div className="studio-composer-mode">{modeControl}</div>
        <div className="studio-composer-models">
          {choices.map(group => (
            <label className="studio-model-picker" key={group.label}>
              {group.badge && <span aria-hidden="true">{group.badge}</span>}
              <select aria-label={group.label} value={group.value} onChange={event => group.onChange(event.target.value)}
                disabled={disabled || loading || group.disabled}>
                {group.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              {!group.disabled && <ChevronDown aria-hidden="true" size={13} />}
            </label>
          ))}
        </div>
        <Button type="submit" size="icon" disabled={!canSubmit} aria-label={loading ? "Sending message" : "Send message"}
          className="size-9 shrink-0 rounded-full">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span key={action} aria-hidden="true"
              initial={reduceMotion ? false : { opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }} transition={transition} className="grid place-items-center">
              {loading ? <LoaderCircle className="size-[18px] motion-safe:animate-spin" /> : <ArrowUp className="size-[18px]" />}
            </motion.span>
          </AnimatePresence>
        </Button>
      </div>
    </form>
  );
}
