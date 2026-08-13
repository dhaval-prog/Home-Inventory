import { Fragment } from "react";
import { ChevronRight } from "lucide-react";
import { getIcon } from "@/lib/icon-map";
import type { LocationNode } from "@/lib/location";

export function LocationPath({
  nodes,
  container,
  className,
  iconClassName,
}: {
  nodes: LocationNode[];
  container?: string | null;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <div className={"flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground " + (className ?? "")}>
      {nodes.map((node, i) => {
        const Icon = getIcon(node.icon);
        return (
          <Fragment key={node.id}>
            {i > 0 && <ChevronRight className="size-3.5 shrink-0 opacity-50" />}
            <span className="inline-flex items-center gap-1">
              <Icon className={iconClassName ?? "size-3.5"} />
              {node.name}
            </span>
          </Fragment>
        );
      })}
      {container && (
        <>
          <ChevronRight className="size-3.5 shrink-0 opacity-50" />
          <span>{container}</span>
        </>
      )}
    </div>
  );
}
