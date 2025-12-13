import {
    ArrowDown,
    ArrowUp,
    ChevronsUpDown,
} from "lucide-react"
import { Column } from "@tanstack/react-table"

import { cn } from "@/lib/utils"
// import { Button } from "@/components/ui/button" // Assuming Button exists.
// import {
//   DropdownMenu,
//   DropdownMenuContent,
//   DropdownMenuItem,
//   DropdownMenuSeparator,
//   DropdownMenuTrigger,
// } from "@/components/ui/dropdown-menu"
// I don't know if DropdownMenu is available. To stay safe and avoid errors, I will implement a simpler version using just Buttons for sorting if not available.
// BUT, usually these standard headers use Dropdowns.
// Let's check if "dropdown-menu.tsx" exists in components/ui.
// I did not list it in step 115.
// I will implement a simple clickable header for now. Click to toggle sort.

import { Button } from "@/components/ui/button"

interface DataTableColumnHeaderProps<TData, TValue>
    extends React.HTMLAttributes<HTMLDivElement> {
    column: Column<TData, TValue>
    title: string
}

export function DataTableColumnHeader<TData, TValue>({
    column,
    title,
    className,
}: DataTableColumnHeaderProps<TData, TValue>) {
    if (!column.getCanSort()) {
        return <div className={cn(className)}>{title}</div>
    }

    return (
        <div className={cn("flex items-center space-x-2", className)}>
            <Button
                variant="ghost"
                size="sm"
                className="-ml-3 h-8 data-[state=open]:bg-accent"
                onClick={() => {
                    // Simple toggle cycle
                    if (!column.getIsSorted()) {
                        column.toggleSorting(false) // asc
                    } else if (column.getIsSorted() === "asc") {
                        column.toggleSorting(true) // desc
                    } else {
                        column.clearSorting()
                    }
                }}
            >
                <span>{title}</span>
                {column.getIsSorted() === "desc" ? (
                    <ArrowDown className="ml-2 h-4 w-4" />
                ) : column.getIsSorted() === "asc" ? (
                    <ArrowUp className="ml-2 h-4 w-4" />
                ) : (
                    <ChevronsUpDown className="ml-2 h-4 w-4" />
                )}
            </Button>
        </div>
    )
}
