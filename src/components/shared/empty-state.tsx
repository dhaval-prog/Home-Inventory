import { getIcon, getCompactIcon } from "@/lib/icon-map";

export function EmptyState({
  icon,
  isRoomIcon = false,
  title,
  description,
  action,
}: {
  icon: string;
  isRoomIcon?: boolean;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  const Icon = isRoomIcon ? getCompactIcon(icon) : getIcon(icon);
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed bg-muted/30 px-6 py-16 text-center">
      <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="size-7" />
      </span>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
