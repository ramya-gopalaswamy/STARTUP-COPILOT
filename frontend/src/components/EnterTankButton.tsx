"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { OysterPitchButton } from "./OysterPitchButton";
import { TankTransition } from "./TankTransition";

export function EnterTankButton() {
  const router = useRouter();
  const [showTransition, setShowTransition] = useState(false);

  const handleInitialClick = () => {
    setShowTransition(true);
  };

  const handleEnterTank = () => {
    setTimeout(() => router.push("/virtual-tank"), 900);
  };

  return (
    <>
      {/* Persistent CTA on Mission Control - when transition is not shown */}
      <AnimatePresence mode="wait">
        {!showTransition ? (
          <motion.div
            key="cta"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20"
          >
            <OysterPitchButton onClick={handleInitialClick} />
          </motion.div>
        ) : (
          <motion.div
            key="transition"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="fixed inset-0 z-30"
          >
            <TankTransition onEnterTank={handleEnterTank} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
