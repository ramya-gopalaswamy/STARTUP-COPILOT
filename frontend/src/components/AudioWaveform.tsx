"use client";

import { motion } from "framer-motion";

interface AudioWaveformProps {
  active: boolean;
  colorClass?: string;
}

export function AudioWaveform({
  active,
  colorClass = "bg-white",
}: AudioWaveformProps) {
  const bars = Array.from({ length: 16 });

  return (
    <div className="flex items-end gap-0.5 h-6">
      {bars.map((_, index) => (
        <motion.div
          key={index}
          initial={{ scaleY: 0.3, opacity: 0.6 }}
          animate={
            active
              ? {
                  scaleY: [0.3, 1.1, 0.4],
                  opacity: [0.5, 1, 0.6],
                }
              : { scaleY: 0.3, opacity: 0.4 }
          }
          transition={{
            duration: 1.2 + index * 0.03,
            repeat: active ? Infinity : 0,
            ease: "easeInOut",
          }}
          className={`${colorClass} w-[3px] rounded-full origin-bottom`}
        />
      ))}
    </div>
  );
}

