import { motion, useReducedMotion } from "motion/react";
import python from "../assets/python.svg";
import rust from "../assets/rust.svg";
import golang from "../assets/golang.svg";
import typescript from "../assets/typescript.svg";

const LANGS = [
  { name: "Python", src: python, modifier: "" },
  { name: "Rust", src: rust, modifier: "lang__logo--rust" },
  { name: "Go", src: golang, modifier: "" },
  { name: "TypeScript", src: typescript, modifier: "" },
];

export default function LanguageLogos() {
  const reduce = useReducedMotion();

  return (
    <div className="langs" role="list" aria-label="Supported languages">
      {LANGS.map((lang) => (
        <motion.button
          key={lang.name}
          type="button"
          role="listitem"
          className="lang"
          aria-label={lang.name}
          whileHover={reduce ? undefined : { y: -4, scale: 1.1 }}
          whileTap={reduce ? undefined : { scale: 0.97 }}
          transition={{ type: "spring", stiffness: 400, damping: 22 }}
        >
          <img
            src={lang.src}
            alt=""
            className={`lang__logo ${lang.modifier}`.trim()}
            width={26}
            height={26}
          />
        </motion.button>
      ))}
    </div>
  );
}
