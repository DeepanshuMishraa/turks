import { motion, useReducedMotion } from "motion/react";
import Command from "./Command";
import LanguageLogos from "./LanguageLogos";

const TRANSITION = { duration: 0.45, ease: [0.16, 1, 0.3, 1] } as const;

export default function Hero() {
  const reduce = useReducedMotion();

  return (
    <section className="hero" aria-labelledby="hero-title">
      {/* Background patterns: dotted pattern + square grid pattern */}
      <motion.div
        className="bg-dots"
        aria-hidden="true"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      />
      <motion.div
        className="bg-grid"
        aria-hidden="true"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      />

      <div className="hero__inner">
        <motion.h1
          id="hero-title"
          className="hero__title"
          initial={
            reduce ? false : { opacity: 0, y: 20, filter: "blur(12px)" }
          }
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ ...TRANSITION, delay: 0.05 }}
        >
          Build your stack. Get your repo.
        </motion.h1>

        <motion.p
          className="hero__sub"
          initial={
            reduce ? false : { opacity: 0, y: 16, filter: "blur(8px)" }
          }
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ ...TRANSITION, delay: 0.1 }}
        >
          A typed monorepo from compatible clients, backends, databases, and
          data layers, generated and validated by one command.
        </motion.p>

        <motion.div
          className="hero__command-wrap"
          initial={
            reduce ? false : { opacity: 0, y: 14, filter: "blur(6px)" }
          }
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ ...TRANSITION, delay: 0.15 }}
        >
          <Command />
        </motion.div>

        <motion.div
          className="hero__langs-wrap"
          initial={
            reduce ? false : { opacity: 0, y: 12, filter: "blur(6px)" }
          }
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ ...TRANSITION, delay: 0.2 }}
        >
          <LanguageLogos />
        </motion.div>
      </div>
    </section>
  );
}

