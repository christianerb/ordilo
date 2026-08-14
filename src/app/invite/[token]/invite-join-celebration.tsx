import { Heart } from "lucide-react";
import { OrdiloMascot } from "@/components/ordilo/mascot";

/** A short, decorative welcome moment after two families become one. */
export function InviteJoinCelebration() {
  return (
    <div
      className="invite-join-celebration relative mx-auto flex h-36 w-full max-w-[16rem] items-end justify-center overflow-hidden"
      aria-hidden="true"
      data-testid="invite-join-celebration"
    >
      <div className="absolute inset-x-5 bottom-3 h-px bg-[var(--mist-light)]" />
      <span className="invite-join-celebration__glow absolute bottom-1 size-24 rounded-full bg-[var(--auth-sage)]" />
      <span className="invite-join-celebration__spark invite-join-celebration__spark--left absolute left-[31%] top-6 size-2 rounded-full bg-[var(--apricot)]" />
      <span className="invite-join-celebration__spark invite-join-celebration__spark--right absolute right-[31%] top-4 size-1.5 rounded-full bg-[var(--apricot)]" />
      <span className="invite-join-celebration__heart absolute bottom-[4.2rem] z-10 flex size-8 items-center justify-center rounded-full bg-[var(--warm-white)] text-[var(--apricot)] shadow-card">
        <Heart className="size-4 fill-current" strokeWidth={1.75} />
      </span>
      <div className="invite-join-celebration__elephant invite-join-celebration__elephant--left relative z-10">
        <OrdiloMascot size={88} mood="success" style={{ color: "var(--petrol)" }} />
      </div>
      <div className="invite-join-celebration__elephant invite-join-celebration__elephant--right relative z-10 -ml-4">
        <div className="-scale-x-100"><OrdiloMascot size={88} mood="success" style={{ color: "var(--petrol)" }} /></div>
      </div>
    </div>
  );
}
