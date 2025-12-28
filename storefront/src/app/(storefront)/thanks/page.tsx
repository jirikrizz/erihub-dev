import Link from "next/link";

export default function ThanksPage() {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-2xl flex-col items-center justify-center rounded-[3rem] border border-white/10 bg-brand-glass p-12 text-center shadow-brand">
      <span className="text-xs uppercase tracking-[0.35em] text-white/50">Děkujeme</span>
      <h1 className="mt-4 font-display text-4xl text-white">Objednávka přijata</h1>
      <p className="mt-4 text-sm leading-relaxed text-white/70">
        Platba přes Stripe proběhla úspěšně. Jakmile se webhook propíše do HUBu, uvidíš objednávku i v pipeline a zákazníkovi odejde potvrzení.
      </p>
      <Link href="/" className="mt-8 inline-flex rounded-full border border-white/20 px-8 py-3 text-sm font-semibold text-white transition hover:border-white/40">
        Zpět na microshop
      </Link>
    </div>
  );
}
