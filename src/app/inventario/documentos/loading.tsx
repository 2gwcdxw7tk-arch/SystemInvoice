import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
    return (
        <div className="container mx-auto py-6 space-y-6">
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <Skeleton className="h-8 w-40" />
                    <Skeleton className="h-4 w-72" />
                </div>
                <Skeleton className="h-10 w-36" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
            </div>
            <div className="rounded-lg border">
                <div className="p-4 space-y-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-4">
                            <Skeleton className="h-4 w-20" />
                            <Skeleton className="h-4 w-36" />
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-4 w-20" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
