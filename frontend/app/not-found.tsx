import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 bg-[#050b14]">
      <div className="text-center max-w-md">
        <h1 className="text-4xl font-semibold text-white mb-2">404</h1>
        <p className="text-white/70 mb-6">This page couldn’t be found.</p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border-2 border-biolumeTeal bg-biolumeTeal/10 text-biolumeTeal font-medium hover:bg-biolumeTeal/20 transition"
        >
          Go to Founder&apos;s Flight Deck
        </Link>
      </div>
    </main>
  );
}
