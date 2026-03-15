"use client";

import { motion } from "framer-motion";
import { OysterPitchButton } from "./OysterPitchButton";

interface TankTransitionProps {
  onEnterTank: () => void;
}

export function TankTransition({ onEnterTank }: TankTransitionProps) {
  return (
    <div className="relative h-screen w-full flex items-center justify-center overflow-hidden">
      {/* The Cinematic Shark Video */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute z-0 w-auto min-w-full min-h-full max-w-none object-cover opacity-50"
        aria-hidden
      >
        <source src="/videos/sharkbg.mp4" type="video/mp4" />
      </video>

      {/* Dark Overlay to make the button pop */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/60 to-black/80 z-10" />

      {/* The High-End Button Component */}
      <div className="relative z-20 mt-16">
        <OysterPitchButton onClick={onEnterTank} />
      </div>
    </div>
  );
}
