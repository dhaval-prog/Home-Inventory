import { redirect } from "next/navigation";
import { QuickAddNavigator } from "@/components/nav/quick-add-navigator";

export default async function QuickAddPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; homeId?: string }>;
}) {
  const { type, homeId } = await searchParams;

  if (type === "item") {
    redirect(homeId ? `/items/new?homeId=${homeId}` : "/items/new");
  }

  return <QuickAddNavigator type={type === "storage" ? "storage" : "furniture"} initialHomeId={homeId} />;
}
