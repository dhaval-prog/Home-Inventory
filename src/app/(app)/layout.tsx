import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/nav/sidebar";
import { BottomNav } from "@/components/nav/bottom-nav";
import { Header } from "@/components/nav/header";
import { Toaster } from "@/components/ui/sonner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  const { data: homes } = await supabase
    .from("homes")
    .select("id, name")
    .order("created_at", { ascending: true })
    .limit(1);

  const name = profile?.name || user.email?.split("@")[0] || "there";

  return (
    <div className="radiant-bg flex min-h-svh text-[#0b0b14]">
      <Sidebar homeName={homes?.[0]?.name} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header name={name} email={user.email ?? ""} />
        <main className="flex-1 pb-28 md:pb-8">{children}</main>
      </div>
      <BottomNav />
      <Toaster />
    </div>
  );
}
