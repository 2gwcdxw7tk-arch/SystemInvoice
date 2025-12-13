import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
    return (
        <div className="container mx-auto py-6 space-y-6">
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <Skeleton className="h-8 w-32" />
                    <Skeleton className="h-4 w-64" />
                </div>
                <Skeleton className="h-10 w-32" />
            </div>
            <div className="rounded-lg border">
                <div className="p-4 space-y-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-4">
                            <Skeleton className="h-4 w-16" />
                            <Skeleton className="h-4 w-48" />
                            <Skeleton className="h-4 w-24" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
