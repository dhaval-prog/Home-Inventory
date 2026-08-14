export default function VaultPage() {
  return (
    <div className="h-[calc(100vh-4rem)] min-h-[560px] w-full overflow-hidden rounded-3xl md:h-[calc(100vh-2rem)]">
      <iframe src="/vault/vault.html" title="Aegis Vault" className="size-full border-0" allow="fullscreen" />
    </div>
  );
}
