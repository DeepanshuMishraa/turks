import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Copy } from "@phosphor-icons/react";

const COMMAND = "npx create-turks@latest";

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
  } finally {
    ta.remove();
  }
}

export default function Command() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  const handleCopy = async () => {
    try {
      await copyText(COMMAND);
      setCopied(true);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="command__box">
      <pre className="command__term">
        <span className="prompt">$ </span>
        {COMMAND}
      </pre>

      <motion.button
        type="button"
        className="command__copy"
        data-copied={copied}
        onClick={handleCopy}
        aria-live="polite"
        aria-label={copied ? "Command copied" : "Copy install command"}
        whileTap={reduce ? undefined : { scale: 0.9 }}
        transition={{ duration: 0.1, ease: "easeOut" }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={copied ? "check" : "copy"}
            className="command__icon"
            initial={reduce ? false : { opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
          >
            {copied ? <Check size={17} weight="bold" /> : <Copy size={17} />}
          </motion.span>
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
