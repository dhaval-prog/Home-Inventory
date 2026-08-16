export default function VaultPage() {
  return (
    <div
      data-black-surface
      className="mt-4 h-[calc(100vh-4rem-1rem)] min-h-[560px] w-full overflow-hidden rounded-3xl md:h-[calc(100vh-2rem-1rem)]"
    >
      <iframe src="/vault/vault.html" title="Vault" className="size-full border-0" allow="fullscreen" />
    </div>
  );
}
