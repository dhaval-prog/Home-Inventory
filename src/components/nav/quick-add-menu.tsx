"use client";

import { useRouter } from "next/navigation";
import { Plus, Package, Archive, Box } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function QuickAddMenu({
  className,
  trigger,
}: {
  className?: string;
  trigger?: React.ReactElement;
}) {
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          trigger ?? (
            <Button className={cn("gap-2", className)}>
              <Plus className="size-4" />
              Quick Add
            </Button>
          )
        }
      />
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem onClick={() => router.push("/quick-add?type=furniture")}>
          <Archive className="size-4" />
          Furniture
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/quick-add?type=storage")}>
          <Box className="size-4" />
          Storage Location
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/quick-add?type=item")}>
          <Package className="size-4" />
          Item
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
