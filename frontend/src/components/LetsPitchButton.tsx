"use client";

import { useState } from "react";
import { motion } from "framer-motion";

const CHARCOAL = "#050B14";
const TEAL = "#00FFE5";
const PURPLE = "#7523FF"; // Electric Jellyfish - left side

interface LetsPitchButtonProps {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

export function LetsPitchButton({ onClick, disabled, className = "" }: LetsPitchButtonProps) {
  const [ripple, setRipple] = useState(false);
  const [hovered, setHovered] = useState(false);

  const handleClick = () => {
    if (disabled) return;
    setRipple(true);
    onClick();
    setTimeout(() => setRipple(false), 1200);
  };

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      {/* Ripple light effect - expands from button */}
      {ripple && (
        <motion.div
          className="absolute pointer-events-none rounded-full"
          style={{ width: 200, height: 200 }}
          initial={{ scale: 0.3, opacity: 0.9 }}
          animate={{ scale: 8, opacity: 0 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          aria-hidden
        >
          <div
            className="w-full h-full rounded-full"
            style={{
              boxShadow: `0 0 100px 50px ${TEAL}, 0 0 200px 80px rgba(0,255,229,0.3)`,
            }}
          />
        </motion.div>
      )}

      <motion.button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        onHoverStart={() => !disabled && setHovered(true)}
        onHoverEnd={() => setHovered(false)}
        whileHover={!disabled ? { scale: 1.02 } : undefined}
        whileTap={!disabled ? { scale: 0.95 } : undefined}
        className="relative rounded-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-biolumeTeal/60 min-w-[280px] md:min-w-[340px] min-h-[52px] md:min-h-[56px] overflow-hidden"
        style={{
          background: CHARCOAL,
          border: "1px solid rgba(0,255,229,0.3)",
          boxShadow: hovered
            ? "0 0 45px rgba(0,255,229,0.5), 0 0 90px rgba(0,255,229,0.25)"
            : "0 0 30px rgba(0,255,229,0.25), 0 0 60px rgba(0,255,229,0.1)",
        }}
      >
        {/* Rotating conic-gradient - full pill shape; ring will show only at edge */}
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(from 0deg, ${TEAL} 0deg, ${TEAL} 80deg, transparent 100deg, transparent 180deg, ${PURPLE} 180deg, ${PURPLE} 260deg, transparent 280deg, transparent 360deg)`,
            filter: "brightness(1.15) drop-shadow(0 0 6px rgba(0,255,229,0.6)) drop-shadow(0 0 6px rgba(117,35,255,0.5))",
          }}
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, ease: "linear", duration: 4 }}
        />

        {/* Inner pill - same shape as button; inset 1px so ring traces the pill edge exactly */}
        <span
          className="absolute inset-[1px] rounded-full flex items-center justify-center px-8 py-4 md:px-10 md:py-4 z-10"
          style={{
            backgroundColor: CHARCOAL,
            border: "1px solid rgba(0,255,229,0.15)",
          }}
        >
          <motion.span
            className="font-bold uppercase tracking-[0.3em] md:tracking-[0.35em] text-xs md:text-base text-white"
            animate={{
              textShadow: [
                "0 0 18px rgba(0,255,229,0.35), 0 0 30px rgba(0,255,229,0.2)",
                "0 0 28px rgba(0,255,229,0.6), 0 0 50px rgba(0,255,229,0.35)",
                "0 0 18px rgba(0,255,229,0.35), 0 0 30px rgba(0,255,229,0.2)",
              ],
            }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
          >
            LET&apos;S PITCH: ENTER THE TANK
          </motion.span>
        </span>
      </motion.button>
    </div>
  );
}
