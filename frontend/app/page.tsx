"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { User, Building2, LogIn } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (typeof window !== "undefined") {
      window.localStorage.setItem("founderName", name.trim());
    }
    router.push("/onboarding");
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 shadow-[0_0_60px_rgba(0,255,229,0.08)]">
          <div className="text-center mb-8">
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-biolumeTeal/90">
              Founder&apos;s Flight Deck
            </h1>
            <p className="text-sm text-white/60 mt-2">
              Descend into the trench. Enter your credentials to begin.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="name"
                className="block text-xs font-medium text-white/70 mb-2 uppercase tracking-wider"
              >
                Founder name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-biolumeTeal/60" />
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  required
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-white/10 bg-black/40 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-biolumeTeal/50 focus:border-biolumeTeal/40 transition"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="company"
                className="block text-xs font-medium text-white/70 mb-2 uppercase tracking-wider"
              >
                Company / venture
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-electricJellyfish/60" />
                <input
                  id="company"
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Startup or project name"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-white/10 bg-black/40 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-electricJellyfish/50 focus:border-electricJellyfish/40 transition"
                />
              </div>
            </div>

            <motion.button
              type="submit"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-biolumeTeal/50 bg-biolumeTeal/10 text-biolumeTeal font-medium shadow-[0_0_24px_rgba(0,255,229,0.2)] hover:bg-biolumeTeal/20 transition"
            >
              <LogIn className="h-4 w-4" />
              Enter the trench
            </motion.button>
          </form>

          <p className="text-[0.65rem] text-white/40 text-center mt-6">
            Mock login — no authentication. Proceed to the Gatekeeper.
          </p>
        </div>
      </motion.div>
    </main>
  );
}
